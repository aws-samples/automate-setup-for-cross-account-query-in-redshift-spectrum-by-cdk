// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const cdk = require('aws-cdk-lib');
const glue = require('@aws-cdk/aws-glue-alpha');
const kms = require('aws-cdk-lib/aws-kms');
const { Serverless } = require(path.join(__dirname, 'constants'));

/**
 * Create glue components after glue is encrypted to avoid accidentally using the previous key.
 */
class GlueComponentsStack extends cdk.NestedStack {
    key;

    constructor(scope, glueStack, vpcStack) {
        super(scope, "glue-components");

        this.key = glueStack.key;

        this.createS3Connection(vpcStack);
        this.createSecurityConfiguration();
    }

    createSecurityConfiguration() {
        return new glue.SecurityConfiguration(this, "default-security-config", {
            securityConfigurationName: Serverless.GLUE_SECURITY_CONFIG,
            cloudWatchEncryption: {
                mode: glue.CloudWatchEncryptionMode.KMS,
                kmsKey: this.key
            },
            jobBookmarksEncryption: {
                mode: glue.JobBookmarksEncryptionMode.CLIENT_SIDE_KMS,
                kmsKey: this.key
            },
            s3Encryption: {
                mode: glue.S3EncryptionMode.KMS,
                kmsKey: kms.Key.fromKeyArn(this, "storage-bucket-key", this.formatArn({
                    service: "kms",
                    account: process.env.STORAGE_ACCOUNT,
                    resource: "key",
                    resourceName: process.env.STORAGE_BUCKET_KEY,
                }))
            }
        });
    }

    createS3Connection(vpcStack) {
        return new glue.Connection(this, "s3-connection", {
            connectionName: Serverless.GLUE_S3_CONNECTION,
            type: glue.ConnectionType.NETWORK,
            securityGroups: [vpcStack.securityGroup],
            subnet: vpcStack.vpc.isolatedSubnets[0],
        });
    }
}

module.exports = { GlueComponentsStack }
