// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const { S3Item } = require(path.join(__dirname, "lib/s3-item"));
const { Loader } = require(path.join(__dirname, "lib/loader"));

exports.handler = async event => {
    console.log(`Received event ${JSON.stringify(event)}`);

    const item = S3Item.createFromNotification(event);
    console.log(`Checked item ${JSON.stringify(item)}`);

    const loader = new Loader(item);

    if (item.isCreated) {
        await loader.load();
    } else if (item.isRemoved) {
        await loader.unload();
    }

    console.log("bye.");
}
