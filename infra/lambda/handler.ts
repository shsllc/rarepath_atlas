/** Lambda adapter: API Gateway HTTP API (payload v2, JWT authorizer) → core.route over DynamoDB. */
import { DynamoDBClient, ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { route, type Claims, type Db, type Item } from "./core";

const TABLE = process.env.TABLE_NAME!;
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

const db: Db = {
  async get(pk, sk) {
    const r = await doc.send(new GetCommand({ TableName: TABLE, Key: { pk, sk }, ConsistentRead: true }));
    return (r.Item as Item | undefined) ?? null;
  },
  async put(item, opts) {
    try {
      await doc.send(new PutCommand({ TableName: TABLE, Item: item, ...(opts?.ifNotExists ? { ConditionExpression: "attribute_not_exists(pk)" } : {}) }));
      return true;
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) return false;
      throw e;
    }
  },
  async delete(pk, sk) {
    await doc.send(new DeleteCommand({ TableName: TABLE, Key: { pk, sk } }));
  },
  async query(pk, skPrefix) {
    const out: Item[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const r = await doc.send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: skPrefix ? "pk = :pk AND begins_with(sk, :p)" : "pk = :pk",
          ExpressionAttributeValues: skPrefix ? { ":pk": pk, ":p": skPrefix } : { ":pk": pk },
          ConsistentRead: true,
          ExclusiveStartKey: start,
        }),
      );
      out.push(...((r.Items as Item[]) ?? []));
      start = r.LastEvaluatedKey;
    } while (start);
    return out;
  },
  async increment(pk, sk, field, n, set = {}) {
    const names: Record<string, string> = { "#f": field };
    const values: Record<string, unknown> = { ":n": n };
    const sets = Object.keys(set).map((k, i) => {
      names[`#s${i}`] = k;
      values[`:s${i}`] = set[k];
      return `#s${i} = :s${i}`;
    });
    const r = await doc.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk, sk },
        UpdateExpression: `ADD #f :n${sets.length ? ` SET ${sets.join(", ")}` : ""}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: "UPDATED_NEW",
      }),
    );
    return Number(r.Attributes?.[field] ?? 0);
  },
};

function claimsOf(event: APIGatewayProxyEventV2WithJWTAuthorizer): Claims {
  const c = event.requestContext.authorizer.jwt.claims as Record<string, unknown>;
  const raw = c["cognito:groups"];
  // API Gateway renders array claims as "[a b]".
  const groups = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.replace(/^\[|\]$/g, "").split(/[\s,]+/).filter(Boolean) : [];
  return { sub: String(c.sub ?? ""), email: c.email as string | undefined, email_verified: c.email_verified as boolean | string | undefined, name: c.name as string | undefined, groups };
}

export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  let body: unknown = null;
  if (event.body) {
    if (event.body.length > 8_192) return { statusCode: 413, body: JSON.stringify({ error: "Request too large." }) };
    try {
      body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body);
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body." }) };
    }
  }
  const res = await route({ method: event.requestContext.http.method, path: event.rawPath, claims: claimsOf(event), body }, db);
  if (res.status >= 500) console.error(`[api] ${event.requestContext.http.method} ${event.rawPath} -> ${res.status}`);
  return { statusCode: res.status, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(res.body) };
}
