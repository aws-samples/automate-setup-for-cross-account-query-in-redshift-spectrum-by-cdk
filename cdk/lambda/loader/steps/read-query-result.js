// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const { SchemaManager } = require(path.join(__dirname, "../lib/schema-manager"));

exports.handler = async event => {
    console.log(`Received event ${JSON.stringify(event)}`);

    const item = event.item;
    const schemaManager = new SchemaManager(item);
    return await schemaManager.readQueryResult(event.verifyQuery.Id);
}
