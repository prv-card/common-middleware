import { Injectable } from '@nestjs/common';
import { PrismaService } from 'nestjs-prisma';
import { CreateKYCsInput } from './dto/createkyc.dto';
import { OkResponse } from 'src/common/models/okresponse.model';
import { KYCDetailWhereInput } from 'src/@generated/kyc-detail/kyc-detail-where.input';
import { SumSubService } from './sumsub.service';
import {
  GetKYCAccessTokenInput,
  GetKYCResponseInput,
} from './dto/getKYCresponse';
import { WhitelabelConfig } from 'src/common/configs/config.interface';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import crypto from 'crypto';
import iFormData from 'form-data';

@Injectable()
export class KycService {
  private whitelabelConfig: WhitelabelConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sumsub: SumSubService,
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.handleKYC();
    this.whitelabelConfig = config.get<WhitelabelConfig>('whitelabelConfig');
  }

  async createMany(
    whitelabelId: string,

    input: CreateKYCsInput,
  ): Promise<OkResponse> {
    const items = input.data.map((item) => {
      return { ...item, whitelabelId };
    });
    await this.prisma.kYCDetail.createMany({
      data: items,
    });

    return {
      message: 'success',
    };
  }

  getKYCDetails(where: KYCDetailWhereInput) {
    return this.prisma.kYCDetail.findMany({ where });
  }

  async handleFetchApplicantsData() {
    const applicants = await this.prisma.kYCUser.findMany({
      where: {
        kycData: null,
        kycStatus: 'SUCCESS',
      },
      select: {
        kycApplicantId: true,
      },
    });
    for (const applicant of applicants) {
      try {
        const data = await this.sumsub.getApplicantData(
          applicant.kycApplicantId,
        );
        const record = await this.prisma.kYCUser.update({
          where: {
            kycApplicantId: applicant.kycApplicantId,
          },
          data: {
            kycData: JSON.stringify(data),
          },
          select: {
            id: true,
            whitelabelId: true,
            userId: true,
          },
        });
        await this.invokeWhitelabel(record.whitelabelId, {
          type: 'applicantDataReceived',
          data: JSON.stringify({ userId: record.userId, data }),
        });
      } catch (err) {
        console.error('handleFetchApplicantsDataError', err);
      }
    }
  }

  getKYCResponses(where: GetKYCResponseInput) {
    return this.prisma.kYCDetail.findMany({
      where: {
        userId: {
          in: where.ids,
        },
      },
      select: {
        userId: true,
        kycStatus: true,
      },
    });
  }
  async handleKYC() {
    await this.handleFetchApplicantsData();
  }

  getKYCAccessToken(where: GetKYCAccessTokenInput) {
    return this.sumsub.getKYCAccessToken(where.userId);
  }

  createApiConfigSignature(data: any) {
    const signature = crypto.createHmac(
      'sha256',
      process.env.WHITE_LABEL_WEBHOOK_SECRET,
    );
    if (data instanceof iFormData) {
      signature.update(data.getBuffer());
    } else if (data) {
      signature.update(data);
    }
    return {
      'X-App-Access-Sig': signature.digest('hex'),
    };
  }

  async invokeWhitelabel(whitelabelId: string, payload: any) {
    const whitelabelConfig = this.whitelabelConfig[whitelabelId];
    if (!whitelabelConfig) {
      return;
    }
    const url = `${whitelabelConfig.backendUri}/middlewarehooks/kyc`;
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...this.createApiConfigSignature(JSON.stringify(payload)),
    };

    const maxRetries = 2;
    const delay = 10000; // 10 seconds

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.http.axiosRef.post(url, payload, {
          headers,
        });
        return; // Success, exit
      } catch (err) {
        if (attempt < maxRetries) {
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          console.error(
            `Failed to invoke whitelabel webhook after ${maxRetries + 1} attempts`,
            err,
          );
        }
      }
    }
  }
}
