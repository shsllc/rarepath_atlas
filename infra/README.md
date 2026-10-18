# Accounts backend (AWS)

Amazon Cognito (email + password sign-in), an HTTP API with a Cognito JWT authorizer, one Lambda
(`lambda/handler.ts` → `lambda/core.ts`) and one DynamoDB table. Defined with AWS CDK in TypeScript.
Stack: `atlas-backend-dev`, region `us-west-2`. Stateful resources (user pool, table) are retained if
the stack is deleted, and have deletion protection on.

## Deploy

```bash
aws configure sso --profile rarepath-dev   # or: aws configure --profile rarepath-dev
cd infra && npm install
npx cdk bootstrap --profile rarepath-dev   # once per account/region
npx cdk deploy --profile rarepath-dev
```

The deploy prints `UserPoolId`, `UserPoolClientId` and `ApiUrl`. Set them on the site:

| Netlify variable | Value |
|---|---|
| `COGNITO_USER_POOL_ID` | UserPoolId |
| `COGNITO_CLIENT_ID` | UserPoolClientId |
| `ACCOUNTS_API_URL` | ApiUrl |

None of these is a secret (the app client is public), but they switch accounts on, so set them deliberately.

## Curators

Platform reviewers belong to the Cognito group `curators`:

```bash
aws cognito-idp admin-add-user-to-group --user-pool-id <UserPoolId> --username <email> --group-name curators --profile rarepath-dev
```

## Email

Cognito's built-in email sender allows about 50 emails a day, which is enough for testing. Before
launch, verify a sending domain in Amazon SES, request SES production access, and point the user pool
at it.
