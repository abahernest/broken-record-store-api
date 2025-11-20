export async function clearCollection(model: any) {
  if (!model) return;
  try {
    await model.deleteMany({});
  } catch (err) {
    // ignore
  }
}

export async function dropIndexIfExists(model: any, indexName: string) {
  if (!model || !model.collection) return;
  try {
    await model.collection.dropIndex(indexName);
  } catch (err) {
    // ignore if it doesn't exist
  }
}

export async function startMongoMemoryServer(): Promise<any> {
  try {
    // dynamic require to avoid hard dependency in environments that don't need it
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    // set MONGO_URL so the app picks it up
    process.env.MONGO_URL = mongod.getUri();
    return mongod;
  } catch (err) {
    // mongodb-memory-server not available or failed to start
    return null;
  }
}

export async function stopMongoMemoryServer(mongod: any): Promise<void> {
  if (!mongod) return;
  try {
    await mongod.stop();
  } catch (err) {
    // ignore
  }
  try {
    delete process.env.MONGO_URL;
  } catch (err) {
    // ignore
  }
}
