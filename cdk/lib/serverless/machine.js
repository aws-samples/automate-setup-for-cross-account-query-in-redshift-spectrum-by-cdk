// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const path = require('path');
const cdk = require('aws-cdk-lib');
const iam = require('aws-cdk-lib/aws-iam');
const s3 = require('aws-cdk-lib/aws-s3');
const logs = require('aws-cdk-lib/aws-logs');
const lambda = require('aws-cdk-lib/aws-lambda');
const sf = require('aws-cdk-lib/aws-stepfunctions');
const task = require('aws-cdk-lib/aws-stepfunctions-tasks');
const { Constants } = require(path.join(__dirname, '../constants'));
const { Analytic } = require(path.join(__dirname, '../analytic/constants'));
const { Storage } = require(path.join(__dirname, '../storage/constants'));
const { Serverless } = require(path.join(__dirname, '../serverless/constants'));

class MachineStack extends cdk.NestedStack {
    static GLUE_NO_ENTITY = "Glue.EntityNotFoundException";
    static GLUE_NO_ENTITY_PROP = { errors: [MachineStack.GLUE_NO_ENTITY], resultPath: sf.JsonPath.DISCARD };
    static LAMBDA_SERVICE_POLICY = iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole");

    key;
    role;
    toAnalyzeRole;
    log;
    machine;

    analyticRoleArn;

    databaseArn;
    tableArn;
    crawlerArn;
    secretArn;

    createCrawlerLambdaRole;
    checkInputLambdaRole;

    constructor(scope, glueStack) {
        super(scope, "machine");

        this.key = glueStack.key;
        this.role = this.createMachineRole();
        this.toAnalyzeRole = this.createToAnalyzeRole();
        this.log = this.createLog();

        this.databaseArn = this.formatArn({ service: "glue", resource: "database", resourceName: `${Constants.PREFIX}_*` });
        this.tableArn = this.formatArn({ service: "glue", resource: "table", resourceName: `${Constants.PREFIX}_*/*` });
        this.crawlerArn = this.formatArn({ service: "glue", resource: "crawler", resourceName: `${Constants.PREFIX}-*` });
        this.secretArn = this.formatArn({
            arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
            service: "secretsmanager",
            account: process.env.ANALYTIC_ACCOUNT,
            resource: "secret",
            resourceName: process.env.ANALYTIC_CLUSTER_SECRET
        });

        this.machine = this.createLoadMachine();
    }

    createLoadMachine() {
        const postcheckCrawlerStatusStep = this.checkCrawlerStatusStep("postcheck");
        const postCrawlStep = postcheckCrawlerStatusStep
            .next(new sf.Choice(this, "is crawler ready again?")
                .when(sf.Condition.stringEquals("$.crawler.state", "READY"),
                    this.verifyQueryStep().next(this.readQueryResultStep()))
                .otherwise(new sf.Wait(this, "wait for crawler again", {
                    time: sf.WaitTime.duration(cdk.Duration.seconds(10))
                }).next(postcheckCrawlerStatusStep)));

        const precheckCrawlerStatusStep = this.checkCrawlerStatusStep("precheck");
        const preCrawlStep = precheckCrawlerStatusStep
            .next(new sf.Choice(this, "is crawler ready?")
                .when(sf.Condition.stringEquals("$.crawler.state", "READY"),
                    this.startCrawlerStep().next(postCrawlStep))
                .otherwise(new sf.Wait(this, "wait for crawler", {
                    time: sf.WaitTime.duration(cdk.Duration.seconds(10))
                }).next(precheckCrawlerStatusStep)));

        const createDatabaseStep = this.createDatabaseStep();
        const checkDatabaseExists = this.checkDatabaseExistsStep(createDatabaseStep);
        createDatabaseStep.next(checkDatabaseExists);
        const toCreate = this.createSchemaStep()
            .next(checkDatabaseExists)
            .next(this.checkCrawlerExistsStep(this.createCrawlerStep().next(preCrawlStep)))
            .next(preCrawlStep);

        const dropSchemaStep = this.dropSchemaStep();
        const checkDatabaseStep = this.listDatabaseStep(dropSchemaStep)
            .next(new sf.Choice(this, "is database empty?")
                .when(sf.Condition.isPresent("$.database.TableList[0]"),
                    new sf.Succeed(this, "database is not empty"))
                .otherwise(this.deleteDatabaseStep(dropSchemaStep).next(dropSchemaStep)));

        const deleteCrawlerStep = this.deleteCrawlerStep(checkDatabaseStep);
        const toDelete = this.listFolderStep()
            .next(new sf.Choice(this, "is folder empty?")
                .when(sf.Condition.numberEquals("$.folder.keyCount", 0),
                    this.deleteTableStep(deleteCrawlerStep)
                        .next(deleteCrawlerStep)
                        .next(checkDatabaseStep))
                .otherwise(checkDatabaseStep));

        const definition = this.checkInputStep()
            .next(new sf.Choice(this, "object created?")
                .when(sf.Condition.booleanEquals("$.item.isCreated", true), toCreate)
                .otherwise(toDelete));

        return new sf.StateMachine(this, "load-machine", {
            stateMachineName: Serverless.MACHINE_NAME,
            definition: definition,
            role: this.role,
            timeout: cdk.Duration.hours(1),
            tracingEnabled: true,
            logs: {
                destination: this.log,
                level: sf.LogLevel.ALL
            },
        });
    }

    createMachineRole() {
        return new iam.Role(this, "service-role", {
            roleName: Serverless.MACHINE_LOADER_ROLE,
            assumedBy: new iam.ServicePrincipal("states.amazonaws.com"),
        });
    }

    createToAnalyzeRole() {
        this.analyticRoleArn = this.formatArn({
            service: "iam", account: process.env.ANALYTIC_ACCOUNT, region: "",
            resource: "role", resourceName: Analytic.ROLE_FOR_LOADER
        });
        const role = new iam.Role(this, "to-analyze-role", {
            roleName: Serverless.MACHINE_TO_ANALYZE_ROLE,
            assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [MachineStack.LAMBDA_SERVICE_POLICY]
        });
        role.addToPolicy(new iam.PolicyStatement({
            actions: ["sts:AssumeRole"], resources: [this.analyticRoleArn]
        }));
        return role;
    }

    createLog() {
        return new logs.LogGroup(this, "log-group", {
            logGroupName: `/aws/state-machine/${Serverless.MACHINE_NAME}`,
            retention: logs.RetentionDays.ONE_MONTH,
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });
    }

    checkInputStep() {
        const name = "check-input"; // name to locate lambda function as well
        this.checkInputLambdaRole = new iam.Role(this, `${name}-role`, {
            assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [MachineStack.LAMBDA_SERVICE_POLICY]
        });
        return new task.LambdaInvoke(this, name, {
            lambdaFunction: this.lambda(name, this.checkInputLambdaRole, {
                "BUCKET_NAME": Storage.DATA_BUCKET_NAME,
            }),
            payloadResponseOnly: true,
            retryOnServiceExceptions: false,
            timeout: cdk.Duration.minutes(1),
            resultPath: "$.item",
        });
    }

    createSchemaStep() {
        const name = "create-schema";
        return new task.LambdaInvoke(this, name, {
            lambdaFunction: this.lambda(name, this.toAnalyzeRole, {
                "CLUSTER_NAME": Analytic.CLUSTER_NAME,
                "DATABASE_NAME": Analytic.DATABASE_NAME,
                "SECRET_ARN": this.secretArn,
                "IAM_ROLE": `${this.formatArn({
                    service: "iam", account: process.env.ANALYTIC_ACCOUNT, region: "",
                    resource: "role", resourceName: Analytic.REDSHIFT_SERVICE_ROLE
                })},${this.formatArn({
                    service: "iam", account: process.env.STORAGE_ACCOUNT, region: "",
                    resource: "role", resourceName: Storage.ROLE_FOR_REDSHIFT
                })}`,
                "CATALOG_ROLE": `${this.formatArn({
                    service: "iam", account: process.env.ANALYTIC_ACCOUNT, region: "",
                    resource: "role", resourceName: Analytic.REDSHIFT_SERVICE_ROLE
                })},${this.formatArn({
                    service: "iam", region: "",
                    resource: "role", resourceName: Serverless.GLUE_ROLE_FOR_REDSHIFT,
                })}`,
                "REDSHIFT_ROLE_FOR_LOADER": this.analyticRoleArn,
            }),
            payloadResponseOnly: true,
            retryOnServiceExceptions: false,
            timeout: cdk.Duration.minutes(1),
            resultPath: sf.JsonPath.DISCARD
        });
    }

    createDatabaseStep() {
        return new task.CallAwsService(this, "create catalog database", {
            service: "glue",
            action: "createDatabase",
            parameters: {
                DatabaseInput: {
                    Name: sf.JsonPath.stringAt("$.item.schema")
                }
            },
            iamResources: [
                this.formatArn({ service: "glue", resource: "catalog", }),
                this.databaseArn,
            ],
            timeout: cdk.Duration.minutes(1),
            resultPath: sf.JsonPath.DISCARD
        });
    }

    checkDatabaseExistsStep(next) {
        this.role.addToPolicy(new iam.PolicyStatement({
            actions: [
                "kms:Decrypt",
                "kms:Encrypt",
                "kms:GenerateDataKey",
            ],
            resources: [this.key.keyArn]
        }));
        const step = new task.CallAwsService(this, "check catalog database exists", {
            service: "glue",
            action: "getDatabase",
            parameters: {
                Name: sf.JsonPath.stringAt("$.item.schema")
            },
            iamResources: [
                this.formatArn({ service: "glue", resource: "catalog", }),
                this.databaseArn,
            ],
            timeout: cdk.Duration.minutes(1),
            resultPath: sf.JsonPath.DISCARD
        });
        step.addRetry({ errors: [MachineStack.GLUE_NO_ENTITY] });
        step.addCatch(next, MachineStack.GLUE_NO_ENTITY_PROP);
        return step;
    }

    checkCrawlerExistsStep(next) {
        const step = new task.CallAwsService(this, "check crawler exists", {
            service: "glue",
            action: "getCrawler",
            parameters: {
                Name: sf.JsonPath.stringAt("$.item.crawler")
            },
            iamResources: [this.crawlerArn],
            timeout: cdk.Duration.minutes(1),
            resultPath: "$.crawler",
        });
        step.addCatch(next, MachineStack.GLUE_NO_ENTITY_PROP);
        return step;
    }

    checkCrawlerStatusStep(action) {
        return new task.CallAwsService(this, `${action} crawler state`, {
            service: "glue",
            action: "getCrawler",
            parameters: {
                Name: sf.JsonPath.stringAt("$.item.crawler")
            },
            iamResources: [this.crawlerArn],
            timeout: cdk.Duration.minutes(1),
            resultPath: "$.crawler",
            resultSelector: {
                "state.$": "$.Crawler.State"
            }
        });
    }

    createCrawlerStep() {
        const name = "create-crawler";
        this.createCrawlerLambdaRole = new iam.Role(this, `${name}-role`, {
            assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [MachineStack.LAMBDA_SERVICE_POLICY]
        });
        this.createCrawlerLambdaRole.addToPolicy(new iam.PolicyStatement({
            actions: ["glue:CreateCrawler"],
            resources: [this.crawlerArn]
        }));
        this.createCrawlerLambdaRole.addToPolicy(new iam.PolicyStatement({
            actions: ["iam:PassRole"],
            resources: [this.formatArn({
                service: "iam", region: "",
                resource: "role", resourceName: Serverless.GLUE_SERVICE_ROLE
            })]
        }));
        return new task.LambdaInvoke(this, name, {
            lambdaFunction: this.lambda(name, this.createCrawlerLambdaRole, {
                "BUCKET_NAME": Storage.DATA_BUCKET_NAME,
                "GLUE_ROLE": this.formatArn({
                    service: "iam", region: "",
                    resource: "role", resourceName: Serverless.GLUE_SERVICE_ROLE
                }),
                "GLUE_SECURITY_CONFIG": Serverless.GLUE_SECURITY_CONFIG,
                "GLUE_S3_CONNECTION": Serverless.GLUE_S3_CONNECTION,
            }),
            payloadResponseOnly: true,
            retryOnServiceExceptions: false,
            timeout: cdk.Duration.minutes(1),
            resultPath: sf.JsonPath.DISCARD
        });
    }

    startCrawlerStep() {
        return new task.CallAwsService(this, "start crawler", {
            service: "glue",
            action: "startCrawler",
            parameters: {
                Name: sf.JsonPath.stringAt("$.item.crawler")
            },
            iamResources: [this.crawlerArn],
            timeout: cdk.Duration.hours(1),
            resultPath: sf.JsonPath.DISCARD
        });
    }

    verifyQueryStep() {
        const name = "verify-query";
        return new task.LambdaInvoke(this, name, {
            lambdaFunction: this.lambda(name, this.toAnalyzeRole, {
                "CLUSTER_NAME": Analytic.CLUSTER_NAME,
                "DATABASE_NAME": Analytic.DATABASE_NAME,
                "SECRET_ARN": this.secretArn,
                "REDSHIFT_ROLE_FOR_LOADER": this.analyticRoleArn,
            }),
            payloadResponseOnly: true,
            retryOnServiceExceptions: false,
            timeout: cdk.Duration.minutes(1),
            resultPath: "$.verifyQuery"
        });
    }

    readQueryResultStep() {
        const name = "read-query-result";
        const step = new task.LambdaInvoke(this, name, {
            lambdaFunction: this.lambda(name, this.toAnalyzeRole, {
                "REDSHIFT_ROLE_FOR_LOADER": this.analyticRoleArn,
            }),
            payloadResponseOnly: true,
            retryOnServiceExceptions: false,
            timeout: cdk.Duration.minutes(1),
            resultPath: "$.queryResult",
            resultSelector: {
                "rowCount.$": "$.Records[0][0].longValue"
            }
        });
        step.addRetry({ errors: ["ResourceNotFoundException"] });
        return step;
    }

    listFolderStep() {
        const bucket = s3.Bucket.fromBucketName(this, "bucket", Storage.DATA_BUCKET_NAME);
        return new task.CallAwsService(this, "check folder empty", {
            service: "s3",
            action: "listObjectsV2",
            parameters: {
                Bucket: Storage.DATA_BUCKET_NAME,
                Prefix: sf.JsonPath.stringAt("$.item.path")
            },
            iamAction: "s3:List*", // listObjectsV2 needs listBucket
            iamResources: [bucket.bucketArn, bucket.arnForObjects("*")],
            timeout: cdk.Duration.minutes(1),
            resultPath: "$.folder",
            resultSelector: {
                "keyCount.$": "$.KeyCount"
            }
        });
    }

    deleteTableStep(next) {
        const step = new task.CallAwsService(this, "delete catalog table", {
            service: "glue",
            action: "deleteTable",
            parameters: {
                DatabaseName: sf.JsonPath.stringAt("$.item.schema"),
                Name: sf.JsonPath.stringAt("$.item.table")
            },
            iamResources: [
                this.formatArn({ service: "glue", resource: "catalog", }),
                this.databaseArn,
                this.tableArn,
            ],
            timeout: cdk.Duration.minutes(1),
            resultPath: sf.JsonPath.DISCARD
        });
        step.addCatch(next, MachineStack.GLUE_NO_ENTITY_PROP)
        return step;
    }

    deleteCrawlerStep(next) {
        const step = new task.CallAwsService(this, "delete crawler", {
            service: "glue",
            action: "deleteCrawler",
            parameters: {
                Name: sf.JsonPath.stringAt("$.item.crawler")
            },
            iamResources: [this.crawlerArn],
            timeout: cdk.Duration.minutes(1),
            resultPath: sf.JsonPath.DISCARD
        });
        step.addCatch(next, MachineStack.GLUE_NO_ENTITY_PROP)
        return step;
    }

    dropSchemaStep() {
        const name = "drop-schema";
        return new task.LambdaInvoke(this, name, {
            lambdaFunction: this.lambda(name, this.toAnalyzeRole, {
                "CLUSTER_NAME": Analytic.CLUSTER_NAME,
                "DATABASE_NAME": Analytic.DATABASE_NAME,
                "SECRET_ARN": this.secretArn,
                "REDSHIFT_ROLE_FOR_LOADER": this.analyticRoleArn,
            }),
            payloadResponseOnly: true,
            retryOnServiceExceptions: false,
            timeout: cdk.Duration.minutes(1),
            resultPath: "$.dropSchema"
        });
    }

    listDatabaseStep(next) {
        const step = new task.CallAwsService(this, "check catalog database empty", {
            service: "glue",
            action: "getTables",
            parameters: {
                DatabaseName: sf.JsonPath.stringAt("$.item.schema")
            },
            iamAction: "glue:GetTable*", // need extra permissions to get full table list
            iamResources: [
                this.formatArn({ service: "glue", resource: "catalog", }),
                this.databaseArn,
                this.tableArn,
            ],
            timeout: cdk.Duration.minutes(1),
            resultPath: "$.database"
        });
        step.addCatch(next, MachineStack.GLUE_NO_ENTITY_PROP);
        return step;
    }

    deleteDatabaseStep(next) {
        const step = new task.CallAwsService(this, "delete catalog database", {
            service: "glue",
            action: "deleteDatabase",
            parameters: {
                Name: sf.JsonPath.stringAt("$.item.schema"),
            },
            iamResources: [
                this.formatArn({ service: "glue", resource: "catalog", }),
                this.databaseArn,
                this.tableArn,
                this.formatArn({ service: "glue", resource: "userDefinedFunction", resourceName: `${Constants.PREFIX}_*/*` }),
            ],
            timeout: cdk.Duration.minutes(1),
            resultPath: sf.JsonPath.DISCARD
        });
        step.addCatch(next, MachineStack.GLUE_NO_ENTITY_PROP);
        return step;
    }

    // do not set log retention days as it creates extra lambda functions.
    lambda(name, role, env = {}) {
        return new lambda.Function(this, `lambda-${name}`, {
            functionName: `${Constants.PREFIX}-machine-${name}`,
            handler: `steps/${name}.handler`,
            role: role,
            retryAttempts: 0,
            runtime: lambda.Runtime.NODEJS_14_X,
            timeout: cdk.Duration.minutes(15),
            code: lambda.Code.fromAsset(path.join(__dirname, "../../lambda/loader")),
            environment: env,
        });
    }
}

module.exports = { MachineStack }

