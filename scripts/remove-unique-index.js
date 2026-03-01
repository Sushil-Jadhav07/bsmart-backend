const mongoose = require('mongoose');
require('dotenv').config();

const removeIndex = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/bsmart_db';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('wallettransactions');

    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes);

    const indexName = 'user_id_1_post_id_1_type_1';
    const indexExists = indexes.some(idx => idx.name === indexName);

    if (indexExists) {
      console.log(`Dropping index: ${indexName}`);
      await collection.dropIndex(indexName);
      console.log('Index dropped successfully');
    } else {
      console.log(`Index ${indexName} does not exist`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

removeIndex();