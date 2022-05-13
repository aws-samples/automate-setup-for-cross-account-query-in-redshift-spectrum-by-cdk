// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

class CrawlerNotReadyError extends Error {
    constructor(message) {
        super(message);
        this.name = "CrawlerNotReadyError";
    }
}

module.exports = { CrawlerNotReadyError }
