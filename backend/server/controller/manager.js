const path = require('path');
require('dotenv').config('../../.env');

const formatter = require('./formatter');
const fetcher = require('./fetcher');
const sanitize = require('../misc/sanitize');
const { getQuerySubstring, storeQuery } = require('../mysql/queries');

const { read, create } = require('../crud');
const { Card } = require('../mongo/models');

const manager = {};

manager.fetchFromApi = async (input, url) => {
  return fetcher.fetch(url, `?fname=${input}`)
}

manager.storeCards = (data, query) => {
  create.createDocuments(data, Card);
  storeQuery(query);
}

manager.getCachedData = async (input) => {
  return await read.readDocuments({ name: { $regex: input, $options: 'i' } }, Card, { _id: 0, __v: 0 });
}

manager.getQueries = async (input) => {
  return await read.readDocuments({ query: input }, Query, { _id: 0, __v: 0 });
}

/**
 * 
 * @param {String} input - The card name to search for
 * @returns {Object} - The result of the operation
 * 
 * @description - This function is the main controller for the manager module. It sanitizes the input, checks if the data is stored, and fetches the data from the API if it isn't.
 * 
 */
manager.fetch = async (input) => {
  let initialInput;
  let isCached;
  try {
    // Sanitizing and formatting the input
    initialInput = sanitize.cardName(input)
    input = initialInput.toLowerCase();
    console.log(`Input : ${input}`);
    // Checking if any queries which are substrings of the input are already stored
    // If `ab` is stored, then any query *ab* will concern data containing `ab`
    isCached = (await getQuerySubstring(input)).found;

    if (isCached) {
      // We just have to fetch the data from the database since it's already stored
      let data = await manager.getCachedData(input);
      console.log('Stored data : ', data);
      data = await formatter.addImageUrl(data, process.env.SERVER_HOST, '/cards/');
      return { status: 'success', message: 'Sending stored data', data: data };
    } else {
      // Fetching data from the API
      const result = await manager.fetchFromApi(input, process.env.API_URL);
      let data = await formatter.toNecessary(result.data);
      console.log('Data : ', data);

      // Getting all the cards that we already store, to stop already stored data from the cards to fetch
      let storedPasscodes = await formatter.getUniqueValues((await manager.getCachedData(input)), 'passcode');
      console.log('Stored passcodes : ', storedPasscodes);

      // Filtering the data to remove already stored cards
      data = data.filter(card => !storedPasscodes.has(String(card.passcode)));
      console.log('Data after filtering : ', data);

      // Downloading the images and putting them in the public folder
      fetcher.downloadCards(data, path.join(__dirname, '../../public/cards'));

      // Storing the data in the database
      manager.storeCards(data, initialInput);

      return { status: 'success', message: 'Data fetched from the API', data: data };
    }
  } catch (error) {
    return { status: 'error', message: error.message }
  }
}

module.exports = manager;

