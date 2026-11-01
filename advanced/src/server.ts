import "dotenv/config";
import { createStandaloneAdvancedApp } from "./routes/index.ts";

// Without these the service would start, then answer 401 or 500 to everyone, and the backend
// treats that as "Advanced is unavailable" without telling anyone why
for (const name of ["DATABASE_URL", "JWT_SECRET"]) {
  if (!process.env[name]) {
    throw new Error(`${name} is not set. Add it to advanced/.env (see .env.example).`);
  }
}

const port = Number(process.env.PORT) || 4001;
const app = createStandaloneAdvancedApp();

app.listen(port, () => {
  console.log(`IELTStudy Standalone Advanced Server listening on port ${port}`);
});

export default app;
