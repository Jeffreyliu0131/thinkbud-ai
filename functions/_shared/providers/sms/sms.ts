// SMS 验证码发送抽象层
// AUTH_MODE=invite 时不实际发送，仅在 console 打印验证码
// AUTH_MODE=sms 时通过阿里云 SMS 发送

export interface SmsProvider {
  sendCode(phone: string, code: string): Promise<void>
}

/** 邀请码模式：不发短信，验证码固定或打印到控制台 */
export class InviteCodeProvider implements SmsProvider {
  async sendCode(phone: string, code: string): Promise<void> {
    console.log(`[InviteMode] 验证码 ${code} → ${phone}（未实际发送，请在 D1 中查看或使用管理后台）`)
  }
}

/** 阿里云 SMS 模式 */
export class AliyunSmsProvider implements SmsProvider {
  constructor(
    private accessKey: string,
    private secret: string,
    private signName: string,
    private templateCode: string,
  ) {}

  async sendCode(phone: string, code: string): Promise<void> {
    // 阿里云 SMS API 签名算法
    const params: Record<string, string> = {
      Action: 'SendSms',
      Version: '2017-05-25',
      Format: 'JSON',
      RegionId: 'cn-hangzhou',
      PhoneNumbers: phone,
      SignName: this.signName,
      TemplateCode: this.templateCode,
      TemplateParam: JSON.stringify({ code }),
      AccessKeyId: this.accessKey,
      SignatureMethod: 'HMAC-SHA1',
      SignatureVersion: '1.0',
      SignatureNonce: crypto.randomUUID(),
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    }

    // 按 key 排序拼接待签名字符串
    const sortedKeys = Object.keys(params).sort()
    const queryParts = sortedKeys.map(k =>
      `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`
    )
    const stringToSign = `POST&${encodeURIComponent('/')}&${encodeURIComponent(queryParts.join('&'))}`

    // HMAC-SHA1 签名
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(this.secret + '&'),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(stringToSign))
    params.Signature = btoa(String.fromCharCode(...new Uint8Array(sig)))

    const body = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')

    const res = await fetch('https://dysmsapi.aliyuncs.com/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`阿里云 SMS 发送失败: ${text}`)
    }

    const result = await res.json() as { Code: string; Message: string }
    if (result.Code !== 'OK') {
      throw new Error(`短信发送失败: ${result.Message}`)
    }
  }
}

/** 根据环境变量创建 SMS provider */
export function createSmsProvider(env: Record<string, string | undefined>): SmsProvider {
  const mode = env.AUTH_MODE || 'invite'

  if (mode === 'sms' && env.SMS_ACCESS_KEY && env.SMS_SECRET) {
    return new AliyunSmsProvider(
      env.SMS_ACCESS_KEY,
      env.SMS_SECRET,
      env.SMS_SIGN_NAME || 'ThinkBud',
      env.SMS_TEMPLATE_CODE || '',
    )
  }

  return new InviteCodeProvider()
}
