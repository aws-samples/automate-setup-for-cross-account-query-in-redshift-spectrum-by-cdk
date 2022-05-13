// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const cdk = require('aws-cdk-lib');
const iam = require('aws-cdk-lib/aws-iam');
const kms = require('aws-cdk-lib/aws-kms');
const s3 = require('aws-cdk-lib/aws-s3');
const s3n = require('aws-cdk-lib/aws-s3-notifications');
const lambda = require('aws-cdk-lib/aws-lambda');
const { Constants } = require(path.join(__dirname, '../constants'));
const { Analytic } = require(path.join(__dirname, '../analytic/constants'));
const { Storage } = require(path.join(__dirname, 'constants'));
const { Serverless } = require(path.join(__dirname, '../serverless/constants'));

class S3Stack extends cdk.NestedStack {
    key;
    logsBucket;
    dataBucket;
    roleForReshift;

    constructor(scope) {
        super(scope, "s3");

        this.key = this.createKey();
        this.grantDecrpty();

        this.logsBucket = s3.Bucket.fromBucketName(this, "logs", Storage.LOGS_BUCKET_NAME);
        this.dataBucket = this.createDataBucket();
        this.roleForReshift = this.createRoleForRedshift();

        // comment out this to prefer step functions-based solution.
        // this.addNotificationLambda();

        const token = this.createServiceToken();
        // SDK in AWS Lambda does not support EventBridge yet, thus comment out.
        // this.setEventNotification(token);

        this.setBucketPolicies();
    }

    createKey() {
        return new kms.Key(this, "key", {
            enableKeyRotation: true,
            description: "S3 bucket key",
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });
    }

    /**
     * Key policy: give the external account permission to use the KMS key.
     * The external account must delegate the key policy permissions to its users and roles.
     *
     * The above applies to same-account role as well. (s3-role-for-redshift)
     */
    grantDecrpty() {
        this.key.grantDecrypt(new iam.AccountPrincipal(process.env.SERVERLESS_ACCOUNT));
    }

    createDataBucket() {
        return new s3.Bucket(this, "data-bucket", {
            bucketName: Storage.DATA_BUCKET_NAME,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
            encryption: s3.BucketEncryption.KMS,
            encryptionKey: this.key,
            bucketKeyEnabled: true,
            enforceSSL: true,
            autoDeleteObjects: false,
            serverAccessLogsBucket: this.logsBucket,
            serverAccessLogsPrefix: `${Storage.DATA_BUCKET_NAME}-access-logs/`, // need a separator
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
    }

    createRoleForRedshift() {
        const role = new iam.Role(this, "role-for-redshift", {
            roleName: Storage.ROLE_FOR_REDSHIFT,
            assumedBy: new iam.AccountPrincipal(process.env.ANALYTIC_ACCOUNT).withConditions({
                ArnEquals: {
                    "aws:PrincipalArn": this.formatArn({
                        service: "iam", account: process.env.ANALYTIC_ACCOUNT, region: "",
                        resource: "role", resourceName: Analytic.REDSHIFT_SERVICE_ROLE
                    })
                }
            }),
        });
        role.addToPolicy(new iam.PolicyStatement({
            actions: [
                "s3:GetObject*",
                "s3:GetBucket*",
                "s3:List*"],
            resources: [this.dataBucket.bucketArn, this.dataBucket.arnForObjects("*")]
        }));
        role.addToPolicy(new iam.PolicyStatement({
            actions: ["kms:Decrypt"],
            resources: [this.key.keyArn]
        }));
        return role;
    }

    /**
     * 2022-02-08 CDK 2.10 generates "s3:PutBucketNotification" errorly, so cannot use.
     */
    addNotificationLambda() {
        const destination = new s3n.LambdaDestination(
            lambda.Function.fromFunctionArn(this, "lambda-loader", this.formatArn({
                arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
                service: "lambda",
                account: process.env.SERVERLESS_ACCOUNT,
                resource: "function",
                resourceName: Serverless.LAMBDA_LOADER
            })));
        const filter = { prefix: Storage.BUCKET_KEY_PREFIX, suffix: ".csv" };
        this.dataBucket.addObjectCreatedNotification(destination, filter);
        this.dataBucket.addObjectRemovedNotification(destination, filter);
    }

    createServiceToken() {
        return cdk.CustomResourceProvider.getOrCreate(this, "Custom::S3SetEventNotification", {
            timeout: cdk.Duration.minutes(1),
            runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
            description: "Set S3 event notification",
            codeDirectory: path.join(__dirname, "../../lambda/s3/set-event-notification"),
            policyStatements: [{
                Action: "s3:PutBucketNotificationConfiguration",
                Effect: "Allow",
                Resource: this.dataBucket.bucketArn
            }]
        });
    }

    setEventNotification(serviceToken) {
        new cdk.CustomResource(this, 'S3SetEventNotification', {
            resourceType: "Custom::S3SetEventNotification",
            serviceToken: serviceToken,
            properties: { Bucket: this.dataBucket.bucketName }
        });
    }

    setBucketPolicies() {
        const glueServiceRole = this.formatArn({
            service: "iam", region: "", account: process.env.SERVERLESS_ACCOUNT,
            resource: "role", resourceName: Serverless.GLUE_SERVICE_ROLE
        });
        const machineServiceRole = this.formatArn({
            service: "iam", region: "", account: process.env.SERVERLESS_ACCOUNT,
            resource: "role", resourceName: Serverless.MACHINE_LOADER_ROLE
        });

        this.dataBucket.grantRead(new iam.AccountPrincipal(process.env.SERVERLESS_ACCOUNT)
            .withConditions({
                ArnEquals: { "aws:PrincipalArn": [glueServiceRole, machineServiceRole] }
            }));
        this.dataBucket.addToResourcePolicy(new iam.PolicyStatement({
            effect: iam.Effect.DENY,
            principals: [new iam.AnyPrincipal],
            // be careful with this statement. we use this instead of actions: ["s3:*"] because CDK uses an assumed role to delete bucket,
            // therefore we need to allow this role to delete the bucket policy, then it is able to delete the bucket.
            notActions: [
                "s3:DeleteBucketPolicy", // to delete bucket
                "s3:PutBucketPolicy", // to update bucket policy
            ],
            resources: [this.dataBucket.bucketArn, this.dataBucket.arnForObjects("*")],
            conditions: { // if either is met, this statement is bypassed.
                StringNotEqualsIgnoreCase: {
                    "aws:SourceVpc": [
                        process.env.ANALYTIC_VPC,
                    ]
                },
                StringNotEquals: {
                    "aws:PrincipalArn": [
                        glueServiceRole,
                        machineServiceRole,
                        this.roleForReshift.roleArn,
                        this.formatArn({
                            service: "iam",
                            region: "",
                            resource: "user", // shouldn't use root which isn't the actual principal ARN
                            resourceName: "clementy"
                        })
                    ]
                }
            }
        }));
        this.dataBucket.addToResourcePolicy(new iam.PolicyStatement({
            effect: iam.Effect.DENY,
            principals: [new iam.AnyPrincipal()],
            actions: ["s3:*"],
            resources: [this.dataBucket.bucketArn, this.dataBucket.arnForObjects("*")],
            conditions: { Bool: { "aws:SecureTransport": false } }
        }));
        this.dataBucket.addToResourcePolicy(new iam.PolicyStatement({
            effect: iam.Effect.DENY,
            principals: [new iam.AnyPrincipal()],
            actions: ["s3:PutObject"],
            resources: [this.dataBucket.arnForObjects("*")],
            conditions: { Null: { "s3:x-amz-server-side-encryption": true } }
        }));
        this.dataBucket.addToResourcePolicy(new iam.PolicyStatement({
            effect: iam.Effect.DENY,
            principals: [new iam.AnyPrincipal()],
            actions: ["s3:PutObject"],
            resources: [this.dataBucket.arnForObjects("*")],
            conditions: { StringNotEquals: { "s3:x-amz-server-side-encryption": "aws:kms" } }
        }));
        this.dataBucket.addToResourcePolicy(new iam.PolicyStatement({
            effect: iam.Effect.DENY,
            principals: [new iam.AnyPrincipal()],
            actions: ["s3:PutObject"],
            resources: [this.dataBucket.arnForObjects("*")],
            conditions: {
                StringNotEquals: {
                    "s3:x-amz-server-side-encryption-aws-kms-key-id": this.key.keyArn
                }
            }
        }));
    }
}

module.exports = { S3Stack }
