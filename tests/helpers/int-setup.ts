import { LOCAL_DATABASE_URL } from "./local-stack";

process.env.DATABASE_URL = LOCAL_DATABASE_URL;
process.env.QUOTA_HASH_SECRET = "integration-tests-quota-hash-secret";
