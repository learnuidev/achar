import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

import type { AcharConfig } from '../config.ts';
import { importedResources, ownershipOf } from '../config.ts';

export interface AcharMediaStackProps extends StackProps {
  config: AcharConfig;
}

/**
 * Where uploaded assets live, and the CDN that serves them.
 *
 * The bucket is **fully private**: public access blocked, ACLs disabled,
 * encryption at rest, and TLS enforced on every request. The only principal that
 * can read it is the distribution, through an Origin Access Control whose bucket
 * policy is scoped to *this* distribution's ARN — so a second distribution
 * created by somebody else in the same account cannot be pointed at this content.
 *
 * ## Why asset URLs are not signed
 *
 * The obvious next step is a CloudFront key group and a signed URL on every
 * asset, and it is the wrong thing here. An asset URL is *published content*: it
 * goes into a document, into an `<img src>`, into a feed somebody else caches. A
 * signature turns every page render into a signing round trip and every cached
 * page into one that breaks when its URLs expire — which is why a CMS serves its
 * assets from an open CDN and protects them by making the object key
 * unguessable, which is what the ULID in `assets/{projectId}/{dataset}/{assetId}/`
 * is for.
 *
 * The protection that does matter is at the API: reading a `PRIVATE` dataset —
 * its documents, and the listing of its assets — needs a token. What is *not*
 * protected is a URL somebody was already given, and pretending otherwise with a
 * fifteen-minute signature would only make the failure modes worse.
 *
 * ## What this stack deliberately does not do
 *
 * **No access logging.** CloudFront's S3 log delivery needs ACLs re-enabled on
 * the destination bucket with the object-writer ownership model, which is the
 * configuration S3 is retiring; the modern replacement is CloudFront standard
 * logging v2 into CloudWatch, and this console already reads CloudWatch for
 * everything else. Adding the legacy path would be a bucket that exists to hold a
 * format nobody will open.
 */
export class AcharMediaStack extends Stack {
  /** The bucket the handlers presign uploads into. */
  readonly assetsBucket: s3.IBucket;

  /** The distribution that serves them. */
  readonly distribution: cloudfront.IDistribution;

  constructor(scope: Construct, id: string, props: AcharMediaStackProps) {
    super(scope, id, props);

    const { config } = props;
    const own = ownershipOf(config).media;

    if (own) {
      const bucket = new s3.Bucket(this, 'AssetsBucket', {
        bucketName: config.assetsBucketName,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        // `OBJECT_WRITER` would re-enable ACLs, which is the mechanism behind most
        // of the accidental-public-bucket incidents there have been. Everything
        // here is authorized by policy, so nothing needs an ACL.
        objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        // An uploaded asset is content somebody published. An overwritten or
        // deleted one is recoverable rather than gone.
        versioned: true,
        removalPolicy: RemovalPolicy.RETAIN,
        lifecycleRules: [
          {
            // A failed multipart upload leaves parts that are billed and invisible.
            abortIncompleteMultipartUploadAfter: Duration.days(7),
          },
          {
            // Superseded versions are not free, and thirty days is long enough to
            // notice that an asset was replaced with the wrong file.
            noncurrentVersionExpiration: Duration.days(30),
            noncurrentVersionsToRetain: 5,
          },
        ],
        cors: [corsRule(config)],
      });

      const distribution = new cloudfront.Distribution(this, 'Distribution', {
        comment: `Achar ${config.stage} — content assets`,
        // The whole point of the CDN is that a page in Sydney does not wait for a
        // bucket in Virginia.
        priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          // Assets are images and files, and every one of them is worth compressing.
          compress: true,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          responseHeadersPolicy: this.securityHeaders(),
        },
      });

      this.assetsBucket = bucket;
      this.distribution = distribution;
    } else {
      const existing = importedResources(config);
      this.assetsBucket = s3.Bucket.fromBucketName(this, 'AssetsBucket', existing.assetsBucket);
      this.distribution = cloudfront.Distribution.fromDistributionAttributes(this, 'Distribution', {
        distributionId: existing.cloudFrontDistributionId,
        domainName: existing.cloudFrontDomain,
      });
    }

    new CfnOutput(this, 'AssetsBucketName', {
      value: this.assetsBucket.bucketName,
      description: 'The bucket the handlers presign uploads into',
    });
    new CfnOutput(this, 'CloudFrontDomain', {
      value: this.distribution.distributionDomainName,
      description: 'The domain every asset URL is built from',
    });
    new CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'The distribution the console reports on',
    });
  }

  /**
   * The headers every asset response carries.
   *
   * A content CDN serves files that end up embedded in other people's pages, so
   * the defaults matter more here than on a site's own origin: `nosniff` stops a
   * browser treating an uploaded file as script, and the referrer policy stops an
   * asset URL leaking the internal page it was pasted into.
   * `Content-Security-Policy` is deliberately absent — setting one on an image
   * response does nothing, and a policy that does nothing is one people stop
   * reading.
   *
   * A method rather than a free function because a construct needs a scope, and
   * the scope this belongs to is the stack.
   */
  private securityHeaders(): cloudfront.ResponseHeadersPolicy {
    return new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      comment: 'Content assets: sniffing, transport and referrer policy',
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER_WHEN_DOWNGRADE,
          override: true,
        },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
      },
    });
  }
}

/**
 * The CORS rule the studio's uploader needs.
 *
 * An upload is a browser PUT straight to S3 with a presigned URL — the bytes
 * never pass through a Lambda — so the bucket has to allow the origins the studio
 * runs on. `ETag` is exposed because a multipart upload needs it back, and a
 * presigned single PUT is easier to debug when the response is readable at all.
 */
function corsRule(config: AcharConfig): s3.CorsRule {
  const origins = new Set([
    config.mail.appBaseUrl,
    config.mail.studioBaseUrl,
    config.mail.consoleBaseUrl,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
  ]);

  return {
    allowedOrigins: [...origins].filter(Boolean),
    allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD, s3.HttpMethods.PUT],
    allowedHeaders: ['*'],
    exposedHeaders: ['ETag', 'x-amz-version-id'],
    maxAge: 3000,
  };
}
