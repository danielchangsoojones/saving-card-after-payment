const express = require("express");
const app = express();
const path = require("path");
// Copy the .env.example in the root into a .env file in this folder
const env = require("dotenv").config({ path: "./.env" });
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(express.static(__dirname));
app.use(
  express.json({
    // We need the raw body to verify webhook signatures.
    // Let's compute it only when hitting the Stripe webhook endpoint.
    verify: function(req, res, buf) {
      if (req.originalUrl.startsWith("/webhook")) {
        req.rawBody = buf.toString();
      }
    }
  })
);



app.get("/", (req, res) => {
  // Display checkout page
  const thePath = path.join(__dirname, "index.html");
  res.sendFile(thePath);
});

app.get("/stripe-key", (req, res) => {
  res.send({ publicKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

const calculateOrderAmount = items => {
  // Replace this constant with a calculation of the order's amount
  // You should always calculate the order total on the server to prevent
  // people from directly manipulating the amount on the client
  return 1400;
};

app.post("/pay", async (req, res) => {
  const {
    paymentMethodId,
    paymentIntentId,
    items,
    currency,
    isSavingCard
  } = req.body;

  console.log("hi");
  console.log(req.body);
  console.log(req);

  const orderAmount = calculateOrderAmount(items);

  try {
    let intent;

    if (!paymentIntentId) {
      // Create new PaymentIntent
      let paymentIntentData = {
        amount: orderAmount,
        currency: currency,
        payment_method: paymentMethodId,
        confirmation_method: "manual",
        confirm: true
      };

      // // Create a Customer to store the PaymentMethod
      const customer = await stripe.customers.create({
        name: req.body.cardholderName,
        description: "Groupme Customer"
      });

      paymentIntentData.customer = customer.id;

      intent = await stripe.setupIntents.create({
        payment_method_types: ['card'],
        confirm: true,
        payment_method: paymentIntentData.payment_method,
        usage: "off_session",
        customer: paymentIntentData.customer
      });
      
      // // setup_future_usage saves the card and tells Stripe how you plan to use it later
      // // set to "off_session" if you plan on charging the saved card when your user is not present
      // paymentIntentData.setup_future_usage = 'off_session';

      // intent = await stripe.paymentIntents.create(paymentIntentData);
    }

    const response = generateResponse(intent);
    res.send(response);
  } catch (e) {
    // Handle "hard declines" e.g. insufficient funds, expired card, etc
    // See https://stripe.com/docs/declines/codes for more
    res.send({ error: e.message });
  }
});

const generateResponse = intent => {
  // Generate a response based on the intent's status
  switch (intent.status) {
    case "requires_action":
    case "requires_source_action":
      // Card requires authentication
      return {
        requiresAction: true,
        paymentIntentId: intent.id,
        clientSecret: intent.client_secret
      };
    case "requires_payment_method":
    case "requires_source":
      // Card was not properly authenticated, suggest a new payment method
      return {
        error: "Your card was denied, please provide a new payment method"
      };
    case "succeeded":
      // Payment is complete, authentication not required
      // To cancel the payment after capture you will need to issue a Refund (https://stripe.com/docs/api/refunds)
      console.log("💰 Payment received!");
      console.log(intent.client_secret);
      return { clientSecret: intent.client_secret };
  }
};

app.listen(process.env.PORT || 5000, () => console.log(`Node server listening on port ${process.env.PORT || 5000}!`));
