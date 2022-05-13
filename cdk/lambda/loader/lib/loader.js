// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const { CrawlerManager } = require(path.join(__dirname, 'crawler-manager'));
const { SchemaManager } = require(path.join(__dirname, 'schema-manager'));

/**
 * The lambda-based approach. The loader function does everything.
 */
class Loader {
    crawlerManager;
    schemaManager;

    constructor(item) {
        this.crawlerManager = new CrawlerManager(item);
        this.schemaManager = new SchemaManager(item);
    }

    async load() {
        // since SQL supports create "if not exists", we do not check exists here.
        await this.schemaManager.create();
        await this.schemaManager.checkExistsRetry();

        var exists = await this.crawlerManager.exists();
        if (exists) {
            console.log(`Crawler [${this.schemaManager.item.crawler}] exists, skip creation.`);
        } else {
            await this.crawlerManager.create();
            await this.crawlerManager.checkExistsRetry();
        }

        await this.crawlerManager.checkReadyStatusRetry();
        await this.crawlerManager.start();
    }

    async unload() {
        // to be implemented.
    }
}

module.exports = { Loader }
