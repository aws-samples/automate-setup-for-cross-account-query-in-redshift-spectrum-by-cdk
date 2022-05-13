// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const { S3Item } = require(path.join(__dirname, "lib/s3-item"));
const { EventCollector } = require(path.join(__dirname, "lib/event-collector"));

exports.handler = async event => {
    console.log(`Received event ${JSON.stringify(event)}`);

    const items = event.Records.map(r => S3Item.createFromEvent(JSON.parse(r.body)));
    console.log(`Converted to ${items.length} items`);

    const collector = new EventCollector(items);
    await collector.distribute();

    console.log("bye.");
}
