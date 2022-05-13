# Automate preparations for cross-account query in Amazon Redshift Spectrum using AWS CDK

## Introduction
[Amazon Redshift](https://aws.amazon.com/redshift/) Spectrum allows you to query data stored in [Amazon Simple Storage Service](https://aws.amazon.com/s3/) (Amazon S3) buckets, with the data schema stored in [AWS Glue](https://aws.amazon.com/glue/) Data Catalog. You have to do some preparations before you can query the data. At the minimum, you [create an external schema](https://docs.aws.amazon.com/redshift/latest/dg/c-getting-started-using-spectrum-create-external-table.html) in Amazon Redshift and a database in AWS Glue Data Catalog along with the external schema. You create an external table inside the external schema in Amazon Redshift and link it to the data in Amazon S3 bucket. Then you are able to query the data using Amazon Redshift Spectrum. The above preparations are non-trivial.

In a real-world solution, there are more things to consider. On one hand, the three major AWS services are probably provisioned and managed in separate AWS accounts. For example, to categorize Amazon Redshift into analytic account, Amazon S3 into storage account, and AWS Glue into serverless account. On the other hand, best practices and security enhancements are typically applied. Such as customer-managed keys of [AWS Key Management Service](https://aws.amazon.com/kms/) (AWS KMS) for at-rest encryption, and enhanced VPC routing of Amazon Redshift for private networking etc. Those issues further complicate the preparations as well.

In this post, we provide [AWS Cloud Development Kit](https://aws.amazon.com/cdk/) (AWS CDK) package to automate the solution in two phrases. The first phrase is to provision and configure the resources across-account automatically. The second phrase is to prepare for cross-account query automatically. You upload a file into Amazon S3 bucket, wait awhile, then you can query the data. You empty a folder, then the related external schema in Amazon Redshift and database in AWS Glue Data Catalog are deleted after a while.

## Deployment
Set the environmental variables for the analytic, serverless, and storage accounts.
```bash
export AWS_DEFAULT_REGION="us-west-2"

export ANALYTIC_ACCOUNT=
export ANALYTIC_PROFILE=

export SERVERLESS_ACCOUNT=
export SERVERLESS_PROFILE=

export STORAGE_ACCOUNT=
export STORAGE_PROFILE=
```

AWS CDK 2 is used as the infrastructure as code framework.
If this is the first time you run AWS CDK to deploy the stack, initialize the environment:
```bash
cd cdk

# install aws-cdk if not yet installed
npm install -g aws-cdk

# install dependencies
npm install

# bootstrap CDK toolkit stack
cdk bootstrap aws://${ANALYTIC_ACCOUNT}/${AWS_DEFAULT_REGION} --profile $ANALYTIC_PROFILE
cdk bootstrap aws://${SERVERLESS_ACCOUNT}/${AWS_DEFAULT_REGION} --profile $SERVERLESS_PROFILE
cdk bootstrap aws://${STORAGE_ACCOUNT}/${AWS_DEFAULT_REGION} --profile $STORAGE_PROFILE
```

Run the script to deploy the solution across-account.
```bash
./bin/deploy.sh
```

### Manual Deployment
Alternatively, run the commands to deploy the stacks one by one.
The values are output after a successful deployment.
1. Deploy the `logs` stack.
1. Deploy the `analytic` stack, which outputs `ANALYTIC_VPC` and `ANALYTIC_CLUSTER_SECRET`.
1. Deploy the `storage` stack, which outputs `STORAGE_BUCKET_KEY`.
1. Deploy the `serverless` stack.

```bash
export PREFIX="caq"

cdk deploy ${PREFIX}-logs       --require-approval never --profile ${STORAGE_PROFILE}

cdk deploy ${PREFIX}-analytic   --require-approval never --profile ${ANALYTIC_PROFILE}
export ANALYTIC_CLUSTER_SECRET=
export ANALYTIC_VPC=

cdk deploy ${PREFIX}-storage    --require-approval never --profile ${STORAGE_PROFILE}
export STORAGE_BUCKET_KEY=

cdk deploy ${PREFIX}-serverless --require-approval never --profile ${SERVERLESS_PROFILE}
```

### Deployment Time
The following table summarizes the approximate synthesis and deployment time in seconds.

|Stack|Synthesis Time|Deployment Time|Total Time|
|---|---:|---:|---:|
|logs|1.75|65.16|66.91|
|analytic|2.55|619.59|622.14|
|storage|2.68|347.31|349.99|
|serverless|2.53|486.90|489.42|
|**total**|9.51|1518.96|1528.46|

## Cleanup
Run the commands to destroy the solution:
```bash
./bin/destroy.sh
```

## License
This library is licensed under the MIT-0 License. See the LICENSE file.
