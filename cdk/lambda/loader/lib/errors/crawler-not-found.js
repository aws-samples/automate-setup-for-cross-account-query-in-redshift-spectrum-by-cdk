// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

class CrawlerNotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = "CrawlerNotFoundError";
    }
}

module.exports = { CrawlerNotFoundError }
