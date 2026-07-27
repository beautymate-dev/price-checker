import "dotenv/config";

function readStoreId(envVar: string): string | undefined {
  const value = process.env[envVar]?.trim();
  return value ? value : undefined;
}

export const config = {
  newworld: {
    storeId: readStoreId("NEWWORLD_STORE_ID"),
  },
  paknsave: {
    storeId: readStoreId("PAKNSAVE_STORE_ID"),
  },
  woolworths: {
    storeId: readStoreId("WOOLWORTHS_STORE_ID"),
  },
  port: Number(process.env.PORT ?? 3000),
};
