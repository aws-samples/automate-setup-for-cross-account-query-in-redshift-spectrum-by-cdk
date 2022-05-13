// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

class Sqls {
    static createExternalSchema(schema) {
        // pay attention to the different requirements for quotes
        return `create external schema if not exists "${schema}"
        from data catalog
        database '${schema}'
        iam_role '${process.env.IAM_ROLE}'
        catalog_role '${process.env.CATALOG_ROLE}'
        create external database if not exists;`;
    }

    static dropSchema(schema) {
        // for CAQ, we drop everything in cascade mode, to keep data safe
        return `drop schema if exists "${schema}"
        drop external database cascade;`;
    }

    static selectCount(schema, table) {
        return `select count(*) from ${schema}.${table};`;
    }
}

module.exports = { Sqls }
