import "dotenv/config";
import { createStandaloneAdvancedApp } from "./routes/index.ts";

const port = Number(process.env.PORT) || 4001;
const app = createStandaloneAdvancedApp();

app.listen(port, () => {
  console.log(`IELTStudy Standalone Advanced Server listening on port ${port}`);
});

export default app;
