import { App } from "aws-cdk-lib";
import { BackendStack } from "../lib/stack";

const app = new App();
new BackendStack(app, "atlas-backend-dev", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? "us-west-2" },
  allowedOrigins: ["https://rarepath.quirkworksllc.com", "https://rarepathatlas.netlify.app", "http://localhost:3000"],
  description: "Accounts, organisations and usage for the research atlas (Cognito, HTTP API, Lambda, DynamoDB)",
  tags: { project: "rarepath-atlas", env: "dev" },
});
