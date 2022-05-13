// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const AWS = require('aws-sdk');
const s3 = new AWS.S3();

exports.handler = async event => {
    const bucket = event.ResourceProperties.Bucket;

    await s3.putBucketNotificationConfiguration({
        Bucket: bucket,
        NotificationConfiguration: { EventBridgeConfiguration: {} }
    }).promise();
    console.log(`Bucket ${bucket} event notification configured.`)
};
