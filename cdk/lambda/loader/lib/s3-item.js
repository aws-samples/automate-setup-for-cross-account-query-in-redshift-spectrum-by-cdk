// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const { Constants } = require(path.join(__dirname, "constants"));
const { InvalidInputError } = require(path.join(__dirname, "errors/invalid-input"));

/**
 * CAQ supports partition. The files are organized in a 1 + 2 + n structure.
 * The root folder is landing, the first folder defines the schema, and the second folder defines the table.
 * Tables are only defined at the second level folders.
 * Starting from the third object, 
 * if it is a file, then it must be a table and there should be no other folders.
 * If it is a folder, then it must be a partition folder and there should be no other files.
 * For partitions, the level can be arbitrary and only the leaf folders can contain files.
 * Other layouts are considered invalid and the consequence is unknown.
 */
class S3Item {
    isCreated;
    isRemoved;

    key;
    path;
    crawler;

    schema;
    table;

    static createFromNotification(event) {
        if (event.Records == null || event.Records.length == 0) {
            throw new InvalidInputError("No record found.");
        }

        const record = event.Records[0];
        if (record.eventSource != "aws:s3" || record.s3 == null) {
            throw new InvalidInputError("Not an S3 event.");
        }

        if (record.s3.bucket.name != process.env.BUCKET_NAME) {
            throw new InvalidInputError("The bucket is not supported");
        }

        const words = record.s3.object.key.split("/");
        if (words.length < 4) {
            throw new InvalidInputError("The file should be in a folder at the third level or deeper.")
        }

        return new S3Item(record.eventName, record.s3.object.key);
    }

    static createFromEvent(event) {
        if (event.source != "aws.s3") {
            throw new InvalidInputError("Not an S3 event.");
        }

        const detail = event.detail;
        if (detail.bucket.name != process.env.BUCKET_NAME) {
            throw new InvalidInputError("The bucket is not supported");
        }

        const words = detail.object.key.split("/");
        if (words.length < 4) {
            throw new InvalidInputError("The file should be in a folder at the third level or deeper.")
        }

        return new S3Item(event["detail-type"], detail.object.key);
    }

    constructor(eventName, key) {
        const words = key.split("/");

        this.isCreated = eventName.includes("Created");
        this.isRemoved = eventName.includes("Removed") || eventName.includes("Deleted");
        this.key = key;
        this.path = `${words[0]}/${words[1]}/${words[2]}/`;
        this.schema = `${Constants.PREFIX}_${words[1].replace("-", "_")}`; // for Redshift naming convention
        this.table = `${Constants.PREFIX}_${words[2]}`; // this table prefix is set in crawler and permission as well
        this.crawler = `${Constants.PREFIX}-${this.path}`; // store the prefix here due to step functions restriction
    }
}

module.exports = { S3Item }
