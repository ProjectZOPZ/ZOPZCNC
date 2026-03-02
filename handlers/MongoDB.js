const { MongoClient } = require("mongodb");

/**
 * MongoDB client wrapper for managing connections and performing operations.
 */
class MongoDB 
{
  constructor(uri, databaseName) 
  {
    this._uri = uri;
    this._dbName = databaseName;
    this.cachedMongoClient = new MongoClient(uri);
    this._connected = false;
  }

  async connectToDatabase() 
  {
    if (this._connected) 
    {
      throw new Error("MongoDB client is already connected.");
    }
        const datetime = new Date();
    const formatted = `${datetime.getFullYear()}-${String(datetime.getMonth() + 1).padStart(2, '0')}-${String(datetime.getDate()).padStart(2, '0')} ${String(datetime.getHours()).padStart(2, '0')}:${String(datetime.getMinutes()).padStart(2, '0')}:${String(datetime.getSeconds()).padStart(2, '0')}`;
    console.log(`${formatted} [OK] [48;5;238m[97mConnecting to MongoDB\x1b[0m`);
    await this.cachedMongoClient.connect();
    console.log(`${formatted} [OK] [48;5;238m[97mConnected to MongoDB\x1b[0m`);
    this._connected = true;
  }

  async reconnectToDatabase() 
  {
    const datetime = new Date();
    const formatted = `${datetime.getFullYear()}-${String(datetime.getMonth() + 1).padStart(2, '0')}-${String(datetime.getDate()).padStart(2, '0')} ${String(datetime.getHours()).padStart(2, '0')}:${String(datetime.getMinutes()).padStart(2, '0')}:${String(datetime.getSeconds()).padStart(2, '0')}`;
    console.log(`${formatted} [OK] \x1b[48;5;238m\x1b[97mReconnecting to MongoDB!\x1b[0m`);
    await this.disconnectFromDatabase();
    this.cachedMongoClient = new MongoClient(this._uri);
    await this.cachedMongoClient.connect();
    console.log(`${formatted} [48;5;238mReconnected to MongoDB!\x1b[0m`);
    this._connected = true;
  }

  async disconnectFromDatabase() 
  {
    if (!this.cachedMongoClient) return;
    await this.cachedMongoClient.close();
    this.cachedMongoClient = null;
    this._connected = false;
  }

  getCollection(collectionName) 
  {
    if (!this.cachedMongoClient || !this._connected) 
    {
      throw new Error("MongoDB client is not connected. Call connectToDatabase() first.");
    }
    return this.cachedMongoClient.db(this._dbName).collection(collectionName);
  }

  async findDocumentByKey(key, value, collectionName) 
  {
    const collection = this.getCollection(collectionName);
    return await collection.findOne({ [key]: value });
  }

  async updateDocumentByKey(key, value, updateObj, collectionName) 
  {
    const collection = this.getCollection(collectionName);
    return await collection.updateOne({ [key]: value }, { $set: updateObj });
  }

  async updateDocumentArrayByKey(key, value, updateObj, collectionName) 
  {
    const collection = this.getCollection(collectionName);
    return await collection.updateOne({ [key]: value }, { $push: updateObj });
  }

  async updateAndRetrieveDocumentByKey(key, value, updateObj, collectionName) 
  {
    await this.updateDocumentByKey(key, value, updateObj, collectionName);
    return await this.findDocumentByKey(key, value, collectionName);
  }

  async addDocument(document, collectionName) 
  {
    const collection = this.getCollection(collectionName);
    return await collection.insertOne(document);
  }

  async hasKey(key, value, collectionName) 
  {
    const doc = await this.findDocumentByKey(key, value, collectionName);
    return !!doc;
  }

  async collectionsCount(collectionName) 
  {
    const collection = this.getCollection(collectionName);
    return await collection.countDocuments({});
  }
}

globalThis.MongoDB = MongoDB;