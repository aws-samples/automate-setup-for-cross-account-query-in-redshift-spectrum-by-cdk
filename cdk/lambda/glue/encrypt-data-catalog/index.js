// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');
const glue = new AWS.Glue();


exports.handler = async event => {
    const keyArn = event.ResourceProperties.KeyArn;

    await glue.putDataCatalogEncryptionSettings({
        DataCatalogEncryptionSettings: {
            ConnectionPasswordEncryption: {
                ReturnConnectionPasswordEncrypted: true,
                AwsKmsKeyId: keyArn
            },
            EncryptionAtRest: {
                CatalogEncryptionMode: "SSE-KMS",
                SseAwsKmsKeyId: keyArn
            }
        }
    }).promise();
    console.log(`Glue data catalog encrypted with ${keyArn}.`);
};
