// Safe browser-facing identity state. Credentials never belong in this response.
export interface InkboxIdentityView {
  supported: boolean;
  configured: boolean;
  identity: null | {
    handle: string;
    email: string | null;
    ownerEmail: string;
    allowedPhone: string | null;
    status: "pending" | "provisioning" | "ready" | "error";
    step: string;
    error: string | null;
    retryable: boolean;
  };
  connect: null | {
    number: string;
    connect_command: string;
    sms_link: string;
    connect_qr_png_data_url: string;
  };
}
