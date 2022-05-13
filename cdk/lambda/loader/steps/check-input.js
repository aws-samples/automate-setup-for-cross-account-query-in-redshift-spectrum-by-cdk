// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const { S3Item } = require(path.join(__dirname, "../lib/s3-item"));

exports.handler = async event => {
    console.log(`Received event ${JSON.stringify(event)}`);

    if (event.hasOwnProperty("path")) { // coming from lambda
        return event;
    } else { // coming from eventbridge
        return S3Item.createFromEvent(event);
    }
}
