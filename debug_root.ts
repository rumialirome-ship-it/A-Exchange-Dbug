
import http from 'http';

http.get('http://localhost:3000/', (res) => {
  console.log('STATUS:', res.statusCode);
  res.on('data', (chunk) => {});
  res.on('end', () => console.log('DONE'));
}).on('error', (err) => {
  console.error('ERROR:', err.message);
});
