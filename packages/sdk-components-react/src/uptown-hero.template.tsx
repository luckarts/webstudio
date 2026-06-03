import {
  $,
  ws,
  PlaceholderValue,
  type TemplateMeta,
  css,
} from "@webstudio-is/template";

export const meta: TemplateMeta = {
  category: "general",
  order: 1,
  description: "Uptown hero section — auto-generated from deep-extract.json",
  template: (
    <$.UptownHero ws:label="Hero">
      <$.Image
        ws:label="Hero Background"
        src="https://www.uptown.ae/assets/hero-background-Rk6TMBAb.webp"
        alt="UPTOWN about us hero image"
        optimize={false}
        ws:style={css`
          width: 100%;
          height: 900px;
          display: block;
          overflow: clip;
          position: absolute;
          z-index: -1;
          object-fit: cover;
        `}
      />
      <ws.element
        ws:tag="div"
        ws:label="Hero Flex"
        ws:style={css`
          width: 827px;
          height: 380px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
        `}
      >
        <ws.element
          ws:tag="div"
          ws:label="Uptown Link T1"
          ws:style={css`
            margin-bottom: 26.8625px;
            width: 168.172px;
            height: 23px;
            display: flex;
            align-items: center;
            gap: 9.9775px;
            column-gap: 9.9775px;
            row-gap: 9.9775px;
            position: relative;
          `}
        >
          <ws.element
            ws:tag="span"
            ws:label="Uptown Link T1 Icon"
            ws:style={css`
              background-color: rgb(0, 156, 168);
              width: 9.20312px;
              height: 9.20312px;
              display: block;
              transform: matrix(0.728204, -0.685361, 0.685361, 0.728204, 0, 0);
              transition: 0.5s cubic-bezier(0.625, 0.05, 0, 1);
              flex-shrink: 0;
            `}
          />
          <ws.element
            ws:tag="span"
            ws:label="Uptown Link T1 Text"
            ws:style={css`
              font-size: clamp(0.875rem, 1.2rem, 1.5rem);
              color: rgb(0, 156, 168);
              width: auto;
              height: 23px;
              display: block;
              border-color: rgb(0, 156, 168);
              white-space: nowrap;
            `}
          >
            {new PlaceholderValue("ABOUT UPTOWN")}
          </ws.element>
        </ws.element>
        <$.Heading
          ws:label="Hero Heading"
          tag="h1"
          ws:style={css`
            font-size: clamp(100px, calc(16rem + 6px), 18rem);
            line-height: 0.8;
            font-weight: 200;
            color: rgb(0, 0, 255);
            text-transform: uppercase;
            margin-bottom: 34.5375px;
            display: block;
            border-color: rgb(253, 253, 253);
            white-space: nowrap;
          `}
        >
          {new PlaceholderValue("WHO WESS")}
        </$.Heading>
        <$.Paragraph
          ws:label="Hero Description"
          ws:style={css`
            font-size: clamp(0.875rem, 1.2rem, 1.5rem);
            color: rgb(253, 253, 253);
            margin-bottom: 38.375px;
            text-align: center;
          `}
        >
          {
            new PlaceholderValue(
              "We are Uptown - a diverse team of engineers, designers, and innovators driven by one mission: to deliver excellence, transform spaces, and build trust with every project"
            )
          }
        </$.Paragraph>
        <$.Link
          ws:label="CTA Btn"
          href="https://www.uptown.ae/contact"
          ws:style={css`
            width: 118.547px;
            height: 31.3438px;
            display: block;
            position: relative;
            cursor: pointer;
          `}
        >
          <ws.element
            ws:tag="div"
            ws:label="Border"
            ws:style={css`
              width: 127.75px;
              height: 39.0156px;
              display: block;
              position: absolute;
              top: 15.6719px;
              right: -68.4688px;
              bottom: -23.3438px;
              left: 59.2656px;
              transform: matrix(1, 0, 0, 1, -63.875, -19.5078);
              transition: 0.5s cubic-bezier(0.625, 0.05, 0, 1);
              cursor: pointer;
            `}
          />
          <ws.element
            ws:tag="div"
            ws:label="Blur"
            ws:style={css`
              background: rgba(0, 0, 0, 0)
                radial-gradient(
                  50% 50%,
                  rgb(0, 156, 168),
                  rgba(0, 156, 168, 0) 81.52%
                )
                repeat scroll 0% 0% / auto padding-box border-box;
              background-image: radial-gradient(
                50% 50%,
                rgb(0, 156, 168),
                rgba(0, 156, 168, 0) 81.52%
              );
              width: 118.547px;
              height: 19.1875px;
              display: block;
              position: absolute;
              top: 15.6719px;
              right: -59.2656px;
              bottom: -3.51562px;
              left: 59.2656px;
              z-index: -1;
              transform: matrix(1, 0, 0, 1, -59.2734, -9.59375);
              cursor: pointer;
              filter: blur(11px);
              flex-shrink: 0;
            `}
          />
          <ws.element
            ws:tag="div"
            ws:label="Background"
            ws:style={css`
              background-color: rgba(217, 217, 217, 0.08);
              width: 118.547px;
              height: 31.3438px;
              display: block;
              position: absolute;
              z-index: -1;
              cursor: pointer;
              backdrop-filter: blur(5.5px);
            `}
          />
          <ws.element
            ws:tag="div"
            ws:label="Inner"
            ws:style={css`
              padding-top: 7.675px;
              padding-right: 19.1875px;
              padding-bottom: 7.675px;
              padding-left: 19.1875px;
              width: 118.547px;
              height: 31.3438px;
              display: flex;
              align-items: center;
              gap: 11.5125px;
              column-gap: 11.5125px;
              row-gap: 11.5125px;
              cursor: pointer;
            `}
          >
            <ws.element
              ws:tag="span"
              ws:label="Icon"
              ws:style={css`
                background-color: rgb(255, 255, 255);
                width: 7.67188px;
                height: 7.67188px;
                display: block;
                transform: matrix(
                  0.728204,
                  -0.685361,
                  0.685361,
                  0.728204,
                  0,
                  0
                );
                transition: 0.5s cubic-bezier(0.625, 0.05, 0, 1);
                cursor: pointer;
                flex-shrink: 0;
              `}
            />
            <ws.element
              ws:tag="span"
              ws:label="Text"
              ws:style={css`
                font-size: clamp(0.65rem, 0.86rem, 0.9rem);
                color: rgb(255, 255, 255);
                width: auto;
                height: 16px;
                display: block;
                border-color: rgb(255, 255, 255);
                cursor: pointer;
                flex-shrink: 0;
                white-space: nowrap;
              `}
            >
              {new PlaceholderValue("Contact Us")}
            </ws.element>
          </ws.element>
        </$.Link>
      </ws.element>
      <$.Image
        ws:label="Lines Lines"
        src="https://www.uptown.ae/assets/lines-1-Qr38Z-nF.webp"
        alt="decorative lines pattern"
        optimize={false}
        ws:style={css`
          width: 100%;
          height: 900px;
          display: block;
          overflow: hidden;
          position: absolute;
          z-index: -1;
          object-fit: cover;
        `}
      />
    </$.UptownHero>
  ),
};
