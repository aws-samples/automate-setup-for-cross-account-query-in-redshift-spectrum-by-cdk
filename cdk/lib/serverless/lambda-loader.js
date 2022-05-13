// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const cdk = require('aws-cdk-lib');
const iam = require('aws-cdk-lib/aws-iam');
const s3 = require('aws-cdk-lib/aws-s3');
const lambda = require('aws-cdk-lib/aws-lambda');
const { Constants } = require(path.join(__dirname, '../constants'));
const { Analytic } = require(path.join(__dirname, '../analytic/constants'));
const { Storage } = require(path.join(__dirname, '../storage/constants'));
const { Serverless } = require(path.join(__dirname, 'constants'));

class LoaderStack extends cdk.NestedStack {
    role;
    loader;

    constructor(scope, glueStack) {
        super(scope, "loader");

        this.role = this.createServiceRole(glueStack.key);
        this.loader = this.createFunction();

        const bucket = s3.Bucket.fromBucketName(this, "bucket", Storage.DATA_BUCKET_NAME);
        // cannot use ArnEquals and StringEquals at the same time
        this.loader.grantInvoke(new iam.ServicePrincipal("s3.amazonaws.com").withConditions({
            ArnLike: { "aws:SourceArn": bucket.bucketArn },
            StringEquals: { "aws:SourceAccount": process.env.STORAGE_ACCOUNT }
        }));
    }

    createServiceRole(key) {
        const role = new iam.Role(this, "service-role", {
            roleName: Serverless.LAMBDA_LOADER_ROLE,
            assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")
            ]
        });
        role.addToPolicy(new iam.PolicyStatement({
            actions: ["sts:AssumeRole"],
            resources: [
                this.formatArn({
                    service: "iam", account: process.env.ANALYTIC_ACCOUNT, region: "",
                    resource: "role", resourceName: Analytic.ROLE_FOR_LOADER
                })
            ]
        }));
        role.addToPolicy(new iam.PolicyStatement({
            actions: [
                "kms:Decrypt",
                "kms:Encrypt",
                "kms:GenerateDataKey",
            ],
            resources: [key.keyArn]
        }));
        role.addToPolicy(new iam.PolicyStatement({
            actions: ["glue:GetDatabase"],
            resources: [
                this.formatArn({ service: "glue", resource: "catalog", }),
                this.formatArn({ service: "glue", resource: "database", resourceName: `${Constants.PREFIX}_*` }),
            ]
        }));
        role.addToPolicy(new iam.PolicyStatement({
            actions: [
                "glue:CreateCrawler",
                "glue:DeleteCrawler",
                "glue:GetCrawler",
                "glue:StartCrawler",
            ],
            resources: [
                this.formatArn({ service: "glue", resource: "crawler", resourceName: `${Constants.PREFIX}-*`, })
            ]
        }));
        role.addToPolicy(new iam.PolicyStatement({
            actions: ["iam:PassRole"],
            resources: [this.formatArn({
                service: "iam", region: "",
                resource: "role", resourceName: Serverless.GLUE_SERVICE_ROLE
            })]
        }));
        return role;
    }

    createFunction() {
        return new lambda.Function(this, "function", {
            functionName: Serverless.LAMBDA_LOADER,
            handler: "load.handler",
            role: this.role,
            retryAttempts: 0,
            runtime: lambda.Runtime.NODEJS_14_X,
            timeout: cdk.Duration.minutes(15),
            code: lambda.Code.fromAsset(path.join(__dirname, "../../lambda/loader")),
            environment: {
                "BUCKET_NAME": Storage.DATA_BUCKET_NAME,
                "CLUSTER_NAME": Analytic.CLUSTER_NAME,
                "DATABASE_NAME": Analytic.DATABASE_NAME,
                "SECRET_ARN": this.formatArn({
                    arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
                    service: "secretsmanager",
                    account: process.env.ANALYTIC_ACCOUNT,
                    resource: "secret",
                    resourceName: process.env.ANALYTIC_CLUSTER_SECRET
                }),
                "IAM_ROLE": `${this.formatArn({
                    service: "iam", account: process.env.ANALYTIC_ACCOUNT, region: "",
                    resource: "role", resourceName: Analytic.REDSHIFT_SERVICE_ROLE
                })},${this.formatArn({
                    service: "iam", account: process.env.STORAGE_ACCOUNT, region: "",
                    resource: "role", resourceName: Storage.ROLE_FOR_REDSHIFT
                })}`,
                "CATALOG_ROLE": `${this.formatArn({
                    service: "iam", account: process.env.ANALYTIC_ACCOUNT, region: "",
                    resource: "role", resourceName: Analytic.REDSHIFT_SERVICE_ROLE
                })},${this.formatArn({
                    service: "iam", region: "",
                    resource: "role", resourceName: Serverless.GLUE_ROLE_FOR_REDSHIFT,
                })}`,
                "REDSHIFT_ROLE_FOR_LOADER": this.formatArn({
                    service: "iam", account: process.env.ANALYTIC_ACCOUNT, region: "",
                    resource: "role", resourceName: Analytic.ROLE_FOR_LOADER
                }),
                "GLUE_ROLE": this.formatArn({
                    service: "iam", region: "",
                    resource: "role", resourceName: Serverless.GLUE_SERVICE_ROLE
                }),
                "GLUE_SECURITY_CONFIG": Serverless.GLUE_SECURITY_CONFIG,
                "GLUE_S3_CONNECTION": Serverless.GLUE_S3_CONNECTION,
            }
        });
    }
}

module.exports = { LoaderStack }
