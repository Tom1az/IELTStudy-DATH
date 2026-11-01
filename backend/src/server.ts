import "temporal-polyfill/global";
import "dotenv/config";
import app from "./app.ts";

const PORT = Number(process.env.PORT ?? 3000);

app.listen(PORT, () => console.log(`✅ Successfully connected! Server is running on port ${PORT}`));
