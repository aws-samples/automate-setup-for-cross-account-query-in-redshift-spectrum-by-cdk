// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const { CrawlerManager } = require(path.join(__dirname, "../lib/crawler-manager"));

exports.handler = async event => {
    console.log(`Received event ${JSON.stringify(event)}`);

    const item = event.item;
    const crawlerManager = new CrawlerManager(item);
    return await crawlerManager.create();
}
