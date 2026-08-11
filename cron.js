const response = await fetch(`${process.env.APP_URL}/api/jobs/due-alerts`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }
});
if (!response.ok) throw new Error(`No se generaron alertas: ${await response.text()}`);
console.log(await response.text());
