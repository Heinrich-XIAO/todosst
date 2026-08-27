import Resend from "@auth/core/providers/resend";
import { Resend as ResendAPI } from "resend";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

export const ResendOTP = Resend({
  id: "resend-otp",
  apiKey: process.env.AUTH_RESEND_KEY,
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes) {
        crypto.getRandomValues(bytes);
      },
    };
    return generateRandomString(random, "0123456789", 8);
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    const resend = new ResendAPI(provider.apiKey);
    const { error } = await resend.emails.send({
      from: process.env.AUTH_EMAIL_FROM ?? "todosst <onboarding@resend.dev>",
      to: [email],
      subject: "verify your email — todosst",
      text: `your verification code is ${token}`,
      html: `<p style="font-family: monospace; font-size: 16px;">your verification code is <strong>${token}</strong></p><p>this code expires in 15 minutes.</p>`,
    });
    if (error) {
      throw new Error(`could not send email: ${JSON.stringify(error)}`);
    }
  },
});
