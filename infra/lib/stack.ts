import * as path from "node:path";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import { CorsHttpMethod, HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";

export interface BackendProps extends StackProps {
  /** Site origins allowed to call the API from a browser (the app calls it server-side today). */
  allowedOrigins: string[];
}

/**
 * Accounts backend: Cognito (email + password sign-in), an HTTP API protected by a Cognito JWT
 * authorizer, one Lambda, and one DynamoDB table. Stateful resources are retained on stack deletion.
 */
export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, props: BackendProps) {
    super(scope, id, props);

    const userPool = new cognito.UserPool(this, "Users", {
      featurePlan: cognito.FeaturePlan.LITE,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      keepOriginal: { email: true },
      standardAttributes: { email: { required: true, mutable: true }, fullname: { required: false, mutable: true } },
      // Length over composition rules (NIST SP 800-63B).
      passwordPolicy: { minLength: 12, requireLowercase: false, requireUppercase: false, requireDigits: false, requireSymbols: false, tempPasswordValidity: Duration.days(3) },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      userVerification: {
        emailSubject: "Your verification code",
        emailBody: "Your verification code is {####}. It expires in 24 hours. If you did not create an account, ignore this email.",
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    new cognito.CfnUserPoolGroup(this, "Curators", { userPoolId: userPool.userPoolId, groupName: "curators", description: "Platform reviewers who can review for the public graph and withdraw any decision" });

    const client = userPool.addClient("Web", {
      generateSecret: false,
      authFlows: { userPassword: true, userSrp: true },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      readAttributes: new cognito.ClientAttributes().withStandardAttributes({ email: true, emailVerified: true, fullname: true }),
      writeAttributes: new cognito.ClientAttributes().withStandardAttributes({ email: true, fullname: true }),
    });

    const table = new dynamodb.TableV2(this, "Data", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      timeToLiveAttribute: "ttl",
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const fn = new NodejsFunction(this, "Api", {
      entry: path.join(__dirname, "..", "lambda", "handler.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      environment: { TABLE_NAME: table.tableName },
      logGroup: new logs.LogGroup(this, "ApiLogs", { retention: logs.RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY }),
      // The Node 22 runtime ships the AWS SDK v3.
      bundling: { externalModules: ["@aws-sdk/*"], minify: true, sourceMap: true },
    });
    table.grantReadWriteData(fn);

    // ID tokens carry email and groups; their audience is the app client id.
    const authorizer = new HttpJwtAuthorizer("Cognito", `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`, { jwtAudience: [client.userPoolClientId] });

    const api = new HttpApi(this, "Http", {
      corsPreflight: { allowOrigins: props.allowedOrigins, allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.PATCH, CorsHttpMethod.DELETE], allowHeaders: ["authorization", "content-type"], maxAge: Duration.hours(1) },
    });
    api.addRoutes({ path: "/{proxy+}", methods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.PATCH, HttpMethod.DELETE], integration: new HttpLambdaIntegration("ApiIntegration", fn), authorizer });
    const stage = api.defaultStage!.node.defaultChild as import("aws-cdk-lib/aws-apigatewayv2").CfnStage;
    stage.defaultRouteSettings = { throttlingBurstLimit: 50, throttlingRateLimit: 25 };

    new CfnOutput(this, "Region", { value: this.region });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: client.userPoolClientId });
    new CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new CfnOutput(this, "TableName", { value: table.tableName });
  }
}
