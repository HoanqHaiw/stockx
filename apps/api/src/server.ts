import { config } from './config.js';
import { createApp } from './app.js';

createApp().listen(config.PORT, () => {
  console.log(`API chạy tại http://localhost:${config.PORT}`);
});
