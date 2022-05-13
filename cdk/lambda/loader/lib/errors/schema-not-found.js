// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

class SchemaNotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = "SchemaNotFoundError";
    }
}

module.exports = { SchemaNotFoundError }
