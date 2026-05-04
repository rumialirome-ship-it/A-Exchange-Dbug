
import http from 'http';

console.log('NODE_ENV:', process.env.NODE_ENV);

http.get('http://localhost:3000/api/health', (res) => {
  console.log('STATUS:', res.statusCode);
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log('HEALTH:', data));
}).on('error', (err) => {
  console.error('SERVER ERROR:', err.message);
});
