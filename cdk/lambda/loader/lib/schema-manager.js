// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const AWS = require('aws-sdk');
const sts = new AWS.STS();
const glue = new AWS.Glue();
const { retry } = require(path.join(__dirname, "retry"));
const { Sqls } = require(path.join(__dirname, "sqls"));
const { SchemaNotFoundError } = require(path.join(__dirname, "errors/schema-not-found"));

class SchemaManager {
    item;
    schema;

    constructor(item) {
        this.item = item;
        this.schema = item.schema;
    }

    async createDataClient() {
        const data = await sts.assumeRole({
            RoleArn: process.env.REDSHIFT_ROLE_FOR_LOADER,
            RoleSessionName: "serverless-loader"
        }).promise();
        return new AWS.RedshiftData({
            accessKeyId: data.Credentials.AccessKeyId,
            secretAccessKey: data.Credentials.SecretAccessKey,
            sessionToken: data.Credentials.SessionToken
        });
    }

    async checkExists() {
        try {
            await glue.getDatabase({ Name: this.schema }).promise();
        } catch (e) {
            throw new SchemaNotFoundError(this.schema);
        }
        console.log(`Schema [${this.schema}] is confirmed.`)
    }

    async checkExistsRetry() {
        await retry(this.checkExists, this);
    }

    async execute(sql) {
        console.log(`Execute SQL: [${sql}]`);

        const rd = await this.createDataClient();
        return await rd.executeStatement({
            ClusterIdentifier: process.env.CLUSTER_NAME,
            Database: process.env.DATABASE_NAME,
            SecretArn: process.env.SECRET_ARN,
            Sql: sql
        }).promise();
    }

    async create() {
        console.log(`Create schema [${this.schema}].`);
        return await this.execute(Sqls.createExternalSchema(this.schema));
    }

    async drop() {
        console.log(`Drop schema [${this.schema}].`);
        return await this.execute(Sqls.dropSchema(this.schema));
    }

    async selectCount() {
        console.log(`Select count ${this.schema}.${this.item.table}.`);
        return await this.execute(Sqls.selectCount(this.schema, this.item.table));
    }

    async readQueryResult(id) {
        const rd = await this.createDataClient();
        return await rd.getStatementResult({ Id: id }).promise();
    }
}

module.exports = { SchemaManager }

