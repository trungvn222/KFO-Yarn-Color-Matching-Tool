import { createClient } from "redis";

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();

const keys = await client.keys("*");
console.log(`Found ${keys.length} keys:`, keys);

if (keys.length > 0) {
  await client.del(keys);
  console.log("All sessions deleted.");
} else {
  console.log("No keys found.");
}

await client.quit();
