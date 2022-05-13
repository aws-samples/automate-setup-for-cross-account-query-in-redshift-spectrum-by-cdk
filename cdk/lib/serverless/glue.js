// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const cdk = require('aws-cdk-lib');
const iam = require('aws-cdk-lib/aws-iam');
const s3 = require('aws-cdk-lib/aws-s3');
const kms = require('aws-cdk-lib/aws-kms');
const { Constants } = require(path.join(__dirname, '../constants'));
const { Analytic } = require(path.join(__dirname, '../analytic/constants'));
const { Storage } = require(path.join(__dirname, '../storage/constants'));
const { Serverless } = require(path.join(__dirname, 'constants'));

class GlueStack extends cdk.NestedStack {
    key;
    role;
    roleForRedshift;

    constructor(scope) {
        super(scope, "glue");

        this.key = this.createKey();
        this.grantDecrypt();

        this.role = this.createServiceRole();
        this.roleForRedshift = this.createRoleForRedshift();

        const serviceToken = this.createServiceToken();
        this.encryptDataCatalog(serviceToken);
    }

    createKey() {
        return new kms.Key(this, "key", {
            enableKeyRotation: true,
            description: "Glue encryption key",
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });
    }

    grantDecrypt() {
        this.key.grantEncryptDecrypt(new iam.ServicePrincipal("logs.amazonaws.com")
            .withConditions({
                ArnEquals: {
                    "kms:EncryptionContext:aws:logs:arn": this.formatArn({
                        arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
                        service: "logs",
                        resource: "log-group",
                        resourceName: "*"
                    })
                }
            }));
    }

    createServiceRole() {
        const bucket = s3.Bucket.fromBucketName(this, "bucket", Storage.DATA_BUCKET_NAME);
        const role = new iam.Role(this, "service-role", {
            roleName: Serverless.GLUE_SERVICE_ROLE,
            assumedBy: new iam.ServicePrincipal("glue.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSGlueServiceRole")
            ]
        });
        role.addToPolicy(new iam.PolicyStatement({
            actions: [
                "kms:Decrypt",
                "kms:Encrypt",
                "kms:GenerateDataKey",
            ],
            resources: [
                this.key.keyArn,
                this.formatArn({
                    service: "kms",
                    account: process.env.STORAGE_ACCOUNT,
                    resource: "key",
                    resourceName: process.env.STORAGE_BUCKET_KEY,
                })
            ]
        }));
        role.addToPolicy(new iam.PolicyStatement({
            actions: [
                "s3:GetObject*",
                "s3:GetBucket*",
                "s3:List*"
            ],
            resources: [bucket.bucketArn, bucket.arnForObjects("*")]
        }));
        role.addToPolicy(new iam.PolicyStatement({
            actions: ["logs:AssociateKmsKey"],
            resources: [this.formatArn({
                arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
                service: "logs",
                resource: "log-group",
                resourceName: "*"
            })],
        }));
        return role;
    }

    createRoleForRedshift() {
        // do not directly assume ArnPrincipal, because CDK converts it to role ID
        const role = new iam.Role(this, "role-for-redshift", {
            roleName: Serverless.GLUE_ROLE_FOR_REDSHIFT,
            assumedBy: new iam.AccountPrincipal(process.env.ANALYTIC_ACCOUNT)
                .withConditions({
                    ArnEquals: {
                        "aws:PrincipalArn": this.formatArn({
                            service: "iam", region: "", account: process.env.ANALYTIC_ACCOUNT,
                            resource: "role", resourceName: Analytic.REDSHIFT_SERVICE_ROLE
                        })
                    }
                }),
        });
        role.addToPolicy(new iam.PolicyStatement({
            actions: [
                "glue:CreateDatabase",
                "glue:DeleteDatabase",
                "glue:GetDatabase",
                "glue:GetDatabases",
                "glue:UpdateDatabase",
                "glue:CreateTable",
                "glue:DeleteTable",
                "glue:BatchDeleteTable",
                "glue:UpdateTable",
                "glue:GetTable",
                "glue:GetTables",],
            resources: [
                this.formatArn({ service: "glue", resource: "catalog", }),
                this.formatArn({ service: "glue", resource: "database", resourceName: `${Constants.PREFIX}_*` }),
                this.formatArn({ service: "glue", resource: "table", resourceName: `${Constants.PREFIX}_*/*` }),
            ]
        }));
        role.addToPolicy(new iam.PolicyStatement({
            actions: [
                "kms:Decrypt",
                "kms:Encrypt",
                "kms:GenerateDataKey",
            ],
            resources: [this.key.keyArn]
        }));
        return role;
    }

    createServiceToken() {
        return cdk.CustomResourceProvider.getOrCreate(this, "Custom::EncryptDataCatalog", {
            timeout: cdk.Duration.minutes(1),
            runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
            codeDirectory: path.join(__dirname, "../../lambda/glue/encrypt-data-catalog"),
            policyStatements: [{
                Effect: "Allow",
                Action: ["glue:PutDataCatalogEncryptionSettings"],
                Resource: [this.formatArn({ service: "glue", resource: "catalog" })]
            }]
        });
    }

    encryptDataCatalog(serviceToken) {
        new cdk.CustomResource(this, "EncryptDataCatalog", {
            resourceType: "Custom::EncryptDataCatalog",
            serviceToken: serviceToken,
            properties: { KeyArn: this.key.keyArn }
        });
    }
}

module.exports = { GlueStack }
