import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`AI Usage Guard API listening on http://localhost:${env.PORT}`);
  console.log(`OpenAPI docs available at http://localhost:${env.PORT}/api/docs`);
});
