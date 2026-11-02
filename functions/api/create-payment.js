
export async function onRequestPost({ request, env }) {
  const headers = { "Content-Type": "application/json" };

  const reply = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers });

  try {
    const { amount, phone, name } = await request.json();

    const value = Number(amount);
    if (!Number.isInteger(value) || value < 500 || value > 1000000000) {
      return reply({ error: "Enter a valid donation amount of at least UGX 500." }, 400);
    }

    let payer = String(phone || "").replace(/[\s\-+]/g, "");
    if (payer.startsWith("0")) payer = "256" + payer.slice(1);

    if (!/^256\d{9}$/.test(payer)) {
      return reply({ error: "Enter a valid Uganda mobile number." }, 400);
    }

    const clientSecret = env.IOTEC_SECRET || env.IOTEC_CLIENT_SECRET;

    if (!env.IOTEC_CLIENT_ID || !clientSecret || !env.IOTEC_WALLET_ID) {
      return reply({ error: "Payment configuration is incomplete." }, 500);
    }

    const tokenResponse = await fetch(
      env.IOTEC_TOKEN_URL || "https://id.iotec.io/connect/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: env.IOTEC_CLIENT_ID,
          client_secret: clientSecret
        })
      }
    );

    if (!tokenResponse.ok) {
      return reply({ error: "Could not authenticate with ioTec." }, 502);
    }

    const tokenData = await tokenResponse.json();

    const paymentResponse = await fetch(
      "https://pay.iotec.io/api/collections/collect",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          category: "MobileMoney",
          currency: "UGX",
          walletId: env.IOTEC_WALLET_ID,
          externalId: crypto.randomUUID(),
          payer,
          payerName: String(name || "Ministry Donor").slice(0, 150),
          payerNote: "Donation to Voice of Unity Ministry",
          amount: value,
          payeeNote: "Ministry donation"
        })
      }
    );

    const responseText = await paymentResponse.text();
    let paymentData;

    try {
      paymentData = JSON.parse(responseText);
    } catch {
      paymentData = { message: responseText };
    }

    if (!paymentResponse.ok) {
      return reply({
        error: paymentData.message || paymentData.code || "ioTec could not initiate the payment."
      }, 502);
    }

    return reply({
      success: true,
      transaction: paymentData,
      message: "Payment request sent. Please check your phone."
    });

  } catch {
    return reply({ error: "Unable to process the payment request." }, 500);
  }
}
