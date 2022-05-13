// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const { Constants } = require(path.join(__dirname, '../constants'));

class Analytic {
    static VPC_CIDR = "10.0.0.0/16";

    static CLUSTER_PORT = 15439;
    static CLUSTER_NAME = `${Constants.PREFIX}-analytic-redshift-cluster`;
    static DATABASE_NAME = "exploratory_zone";
    static USER_NAME = "admin";
    static SECRET_ROTATE_SCHEDULER_NAME = `${Constants.PREFIX}-redshift-cluster-secret-rotate-scheduler`;

    static REDSHIFT_SERVICE_ROLE = `${Constants.PREFIX}-redshift-service-role`;
    static ROLE_FOR_LOADER = `${Constants.PREFIX}-redshift-role-for-loader`;
}

module.exports = { Analytic }
