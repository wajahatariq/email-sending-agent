import { MongoClient, Db } from 'mongodb';

let clientPromise: Promise<MongoClient> | undefined =
  (globalThis as { _mongoClient?: Promise<MongoClient> })._mongoClient;

export async function getMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  if (!clientPromise) {
    clientPromise = new MongoClient(uri).connect();
    (globalThis as { _mongoClient?: Promise<MongoClient> })._mongoClient = clientPromise;
  }
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const dbName = process.env.MONGODB_DB;
  if (!dbName) throw new Error('MONGODB_DB not set');
  const client = await getMongoClient();
  return client.db(dbName);
}
