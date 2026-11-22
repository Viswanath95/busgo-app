import nodemailer from "nodemailer";

const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

const transporter =
    user && pass ? nodemailer.createTransport({ service: "gmail", auth: { user, pass} }) : null;

export async function sendTicketEmail(opts: {
    to: string;
    subject: string;
    text: string;
    filename: string;
    pdf: Buffer;
}): Promise<boolean> {
    if(!transporter) {
        console.warn("SMTP_USER / SMTP_PASS not set - skipping ticket email");
        return false;
    }
    await transporter.sendMail({
        from: `BusGo <${user}>`,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        attachments: [{ filename: opts.filename, content: opts.pdf, contentType: "application/pdf" }],
    });
    return true;
}