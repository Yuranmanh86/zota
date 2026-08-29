import axios from 'axios';

export const api = axios.create({
  baseURL: 'https://api.zora-finance.local',
  timeout: 10000,
});
