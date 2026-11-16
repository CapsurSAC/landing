import { createTransport, type Transporter } from 'nodemailer';
import type { MailMessage, Mailer } from '../../application/ports/notifications';

/**
 * Envío con nodemailer (A7). El transporte se crea una vez a partir de
 * `SMTP_URL`; en pruebas se inyecta uno simulado (p. ej. `jsonTransport`).
 */
export class NodemailerMailer implements Mailer {
  constructor(
    private readonly transporter: Transporter,
    private readonly from: string,
  ) {}

  static fromUrl(smtpUrl: string, from: string): NodemailerMailer {
    return new NodemailerMailer(
      createTransport({ url: smtpUrl, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 }),
      from,
    );
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }

  close(): void {
    this.transporter.close();
  }
}

/** Sin `SMTP_URL`: nunca se encolan correos, pero si alguno llega se reintenta más tarde. */
export class DisabledMailer implements Mailer {
  async send(): Promise<void> {
    throw new Error('SMTP_URL no está configurado');
  }
}
