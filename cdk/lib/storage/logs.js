// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const cdk = require('aws-cdk-lib');
const iam = require('aws-cdk-lib/aws-iam');
const s3 = require('aws-cdk-lib/aws-s3');
const { Constants } = require(path.join(__dirname, '../constants'));
const { Analytic } = require(path.join(__dirname, '../analytic/constants'));
const { Storage } = require(path.join(__dirname, 'constants'));

class LogsStack extends cdk.Stack {
    logsBucket;

    constructor(scope) {
        super(scope, `${Constants.PREFIX}-logs`);

        this.logsBucket = this.createLogsBucket();
        this.setBucketPolicies();
    }

    /**
     * The logs bucket should be in the same region and same account with the data bucket
     * for server access logging.
     */
    createLogsBucket() {
        return new s3.Bucket(this, "logs-bucket", {
            bucketName: Storage.LOGS_BUCKET_NAME,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
            encryption: s3.BucketEncryption.S3_MANAGED, // redshift audit log supports only s3 managed encryption
            enforceSSL: true,
            autoDeleteObjects: false,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
    }

    setBucketPolicies() {
        const dataBucket = s3.Bucket.fromBucketName(this, "data-bucket", Storage.DATA_BUCKET_NAME);
        this.logsBucket.addToResourcePolicy(new iam.PolicyStatement({
            principals: [new iam.ServicePrincipal("redshift.amazonaws.com")],
            actions: ["s3:PutObject", "s3:GetBucketAcl"],
            resources: [this.logsBucket.bucketArn, this.logsBucket.arnForObjects("*")],
            conditions: {
                ArnEquals: {
                    "aws:SourceArn": this.formatArn({
                        arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
                        service: "redshift", account: process.env.ANALYTIC_ACCOUNT,
                        resource: "cluster", resourceName: Analytic.CLUSTER_NAME
                    })
                }
            }
        }));
        // the principal which enables redshift audit logging also needs this permission
        this.logsBucket.addToResourcePolicy(new iam.PolicyStatement({
            principals: [new iam.AccountPrincipal(process.env.ANALYTIC_ACCOUNT)],
            actions: ["s3:PutObject"],
            resources: [this.logsBucket.bucketArn, this.logsBucket.arnForObjects("*")],
        }));

        this.logsBucket.addToResourcePolicy(new iam.PolicyStatement({
            principals: [new iam.ServicePrincipal("logging.s3.amazonaws.com")],
            actions: ["s3:PutObject"],
            resources: [this.logsBucket.bucketArn, this.logsBucket.arnForObjects("*")],
            conditions: {
                ArnEquals: { "aws:SourceArn": dataBucket.bucketArn },
                StringEquals: { "aws:SourceAccount": process.env.STORAGE_ACCOUNT }
            }
        }));
    }
}

module.exports = { LogsStack }
