// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const cdk = require('aws-cdk-lib');
const iam = require('aws-cdk-lib/aws-iam');
const ec2 = require('aws-cdk-lib/aws-ec2');
const s3 = require('aws-cdk-lib/aws-s3');
const kms = require('aws-cdk-lib/aws-kms');
const secrets = require('aws-cdk-lib/aws-secretsmanager');
const redshift = require('@aws-cdk/aws-redshift-alpha');
const { Analytic } = require(path.join(__dirname, 'constants'));
const { Storage } = require(path.join(__dirname, '../storage/constants'));
const { Serverless } = require(path.join(__dirname, '../serverless/constants'));

class RedshiftStack extends cdk.NestedStack {
    key;
    role;
    roleForLoader;
    bucket;
    cluster;

    constructor(scope, vpcStack) {
        super(scope, "redshift");

        this.key = this.createKey();
        this.role = this.createRedshiftRole();
        const subnetGroup = this.createSubnetGroup(vpcStack.vpc, ec2.SubnetType.PRIVATE_ISOLATED);
        const parameterGroup = this.createParameterGroup();

        this.bucket = s3.Bucket.fromBucketName(this, "logs", Storage.LOGS_BUCKET_NAME);
        this.cluster = this.createCluster(vpcStack, subnetGroup, parameterGroup);
        this.roleForLoader = this.createRoleForLoader();
        this.rotateClusterSecret();

        const vpcServiceToken = this.createVpcRoutingServiceToken();
        this.enableVpcRouting(vpcServiceToken);
        const roleServiceToken = this.createDefaultRoleServiceToken();
        this.setDefaultRole(roleServiceToken);
    }

    createKey() {
        return new kms.Key(this, "key", {
            enableKeyRotation: true,
            description: "Redshift encryption key",
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });
    }

    createRedshiftRole() {
        const role = new iam.Role(this, "service-role", {
            roleName: Analytic.REDSHIFT_SERVICE_ROLE,
            assumedBy: new iam.ServicePrincipal("redshift.amazonaws.com"),
        });
        role.addToPolicy(new iam.PolicyStatement({
            actions: ["sts:AssumeRole"],
            resources: [this.formatArn({
                service: "iam", region: "", account: process.env.STORAGE_ACCOUNT,
                resource: "role", resourceName: Storage.ROLE_FOR_REDSHIFT
            }),
            this.formatArn({
                service: "iam", region: "", account: process.env.SERVERLESS_ACCOUNT,
                resource: "role", resourceName: Serverless.GLUE_ROLE_FOR_REDSHIFT
            })]
        }));
        return role;
    }

    createRoleForLoader() {
        const role = new iam.Role(this, "role-for-loader", {
            roleName: Analytic.ROLE_FOR_LOADER,
            assumedBy: new iam.AccountPrincipal(process.env.SERVERLESS_ACCOUNT).withConditions({
                ArnEquals: {
                    "aws:PrincipalArn": [
                        this.formatArn({
                            service: "iam", account: process.env.SERVERLESS_ACCOUNT, region: "",
                            resource: "role", resourceName: Serverless.LAMBDA_LOADER_ROLE
                        }),
                        this.formatArn({
                            service: "iam", account: process.env.SERVERLESS_ACCOUNT, region: "",
                            resource: "role", resourceName: Serverless.MACHINE_TO_ANALYZE_ROLE
                        })
                    ]
                }
            })
        });
        role.addToPolicy(new iam.PolicyStatement({
            actions: ["redshift-data:ExecuteStatement"],
            resources: [this.formatArn({
                arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
                service: "redshift",
                resource: "cluster",
                resourceName: this.cluster.clusterName
            })]
        }));
        role.addToPolicy(new iam.PolicyStatement({
            actions: ["redshift-data:GetStatementResult"],
            resources: ["*"]
        }));
        role.addToPolicy(new iam.PolicyStatement({
            actions: ["secretsmanager:GetSecretValue"],
            resources: [this.cluster.secret.secretArn]
        }));
        return role;
    }

    rotateClusterSecret() {
        this.cluster.secret.addRotationSchedule("schedule", {
            hostedRotation: secrets.HostedRotation.redshiftSingleUser({
                functionName: Analytic.SECRET_ROTATE_SCHEDULER_NAME
            }),
        });
    }

    createParameterGroup() {
        return new redshift.ClusterParameterGroup(this, "parameter-group", {
            description: "enable auditing and require TLS/SSL encryption",
            parameters: {
                require_ssl: "true",
                enable_user_activity_logging: "true"
            }
        });
    }

    createSubnetGroup(vpc, subnetType) {
        return new redshift.ClusterSubnetGroup(this, subnetType + "-subnet-group", {
            vpc: vpc,
            description: subnetType + " subnet group",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            vpcSubnets: { subnetType: subnetType }
        });
    }

    /**
     * If you use node type of RA3, make sure you have access.
     */
    createCluster(vpcStack, subnetGroup, parameterGroup) {
        return new redshift.Cluster(this, "cluster", {
            port: Analytic.CLUSTER_PORT,
            clusterName: Analytic.CLUSTER_NAME,
            defaultDatabaseName: Analytic.DATABASE_NAME,
            masterUser: { masterUsername: Analytic.USER_NAME },
            roles: [this.role],
            vpc: vpcStack.vpc,
            publiclyAccessible: false,
            encrypted: true,
            encryptionKey: this.key,
            numberOfNodes: 1,
            clusterType: redshift.ClusterType.SINGLE_NODE,
            nodeType: redshift.NodeType.DC2_LARGE,
            parameterGroup: parameterGroup,
            securityGroups: [vpcStack.securityGroup],
            subnetGroup: subnetGroup,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
            loggingBucket: this.bucket,
            loggingKeyPrefix: `${Analytic.CLUSTER_NAME}-audit-logs`,
            removalPolicy: cdk.RemovalPolicy.DESTROY
        })
    }

    createVpcRoutingServiceToken() {
        return cdk.CustomResourceProvider.getOrCreate(this, "Custom::EnableVpcRouting", {
            timeout: cdk.Duration.minutes(1),
            runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
            codeDirectory: path.join(__dirname, "../../lambda/redshift/enable-vpc-routing"),
            policyStatements: [{
                Action: ["redshift:ModifyCluster", "redshift:DescribeClusters"],
                Effect: "Allow",
                Resource: this.formatArn({
                    arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
                    service: "redshift",
                    resource: "cluster",
                    resourceName: this.cluster.clusterName
                })
            }]
        });
    }

    enableVpcRouting(serviceToken) {
        new cdk.CustomResource(this, 'EnableVpcRouting', {
            resourceType: "Custom::EnableVpcRouting",
            serviceToken: serviceToken,
            properties: { ClusterIdentifier: this.cluster.clusterName }
        });
    }

    createDefaultRoleServiceToken() {
        return cdk.CustomResourceProvider.getOrCreate(this, "Custom::SetDefaultRole", {
            timeout: cdk.Duration.minutes(1),
            runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
            codeDirectory: path.join(__dirname, "../../lambda/redshift/set-default-role"),
            policyStatements: [{
                Action: ["redshift:ModifyClusterIamRoles", "redshift:DescribeClusters"],
                Effect: "Allow",
                Resource: this.formatArn({
                    arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
                    service: "redshift",
                    resource: "cluster",
                    resourceName: this.cluster.clusterName
                })
            }]
        });
    }

    setDefaultRole(serviceToken) {
        new cdk.CustomResource(this, "SetDefaultRole", {
            resourceType: "Custom::SetDefaultRole",
            serviceToken: serviceToken,
            properties: {
                ClusterIdentifier: this.cluster.clusterName,
                RoleArn: this.role.roleArn
            }
        });
    }
}

module.exports = { RedshiftStack }
