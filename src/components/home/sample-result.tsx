import { LayersIcon, NoteIcon, SparkIcon } from "@/components/icons";
import { PersonaAvatar } from "@/components/persona-avatar";
import { HOME_SAMPLE } from "@/strings/product-strings";

/**
 * The title of the curated topic the sample's persona belongs to, quoted. It is content of the
 * library (`scenarios/ux-chi-tieu/topic.json`), not wording of the product, so it is not among
 * the product's fixed strings.
 */
export const SAMPLE_TOPIC_TITLE = "Chi tiêu hằng ngày của người trẻ đi làm";

/** The share of the bar one group of the sample's items takes. */
const share = (count: number) => `${((count / HOME_SAMPLE.total) * 100).toFixed(1)}%`;

/**
 * Màn 1: the result of a sample session, as the `Main` artboard draws it. It is an example, said
 * so in its bar: the moment it shows is not one of the items a persona of the library holds, so
 * the home page gives away nothing a learner could then ask for.
 */
export function SampleResult() {
  const [before, after] = HOME_SAMPLE.quote.split(HOME_SAMPLE.quote_marked);
  return (
    <figure className="window hero-window" aria-label={HOME_SAMPLE.caption}>
      <div className="window-bar">
        <div className="window-bar-l">
          <span className="wdots">
            <i />
            <i />
            <i />
          </span>
          <span className="code c-variant">{HOME_SAMPLE.label}</span>
        </div>
        <span className="pill pill-primary">
          <LayersIcon size={14} />
          Tảng băng lộ diện
        </span>
      </div>
      <div className="hero-sample">
        <div className="hero-sample-score">
          <div className="hero-sample-who">
            <PersonaAvatar size={48} avatarKey="thu" name="chị Thu" />
            <div>
              <p className="label-lg">{HOME_SAMPLE.persona}</p>
              <p className="body-sm c-variant">{SAMPLE_TOPIC_TITLE}</p>
            </div>
          </div>
          <div>
            <p className="headline-md">{HOME_SAMPLE.guess}</p>
            <p className="headline-md italic c-primary">{HOME_SAMPLE.told_line}</p>
          </div>
          <div className="hero-sample-tally">
            <div className="bar h8" aria-hidden="true">
              <i className="f-secondary" style={{ width: share(HOME_SAMPLE.told) }} />
              <i className="f-tertiary" style={{ width: share(HOME_SAMPLE.held) }} />
              <i className="f-muted" style={{ flex: 1 }} />
            </div>
            <div className="label-sm">
              <span className="c-secondary">{HOME_SAMPLE.told} Đã kể</span>
              <span className="c-tertiary">{HOME_SAMPLE.held} Giữ lại</span>
              <span className="c-amber">{HOME_SAMPLE.missed} Bỏ lỡ</span>
            </div>
          </div>
          <div className="rail-card hero-sample-note">
            <span className="icon-circle">
              <NoteIcon size={16} />
            </span>
            <p className="body-sm">
              <strong className="label-md">{HOME_SAMPLE.recognised}</strong> {HOME_SAMPLE.recognised_rest}
            </p>
          </div>
        </div>
        <div className="hero-sample-moment">
          <div>
            <span className="eyebrow">{HOME_SAMPLE.missed_kind}</span>
            <p className="headline-sm">{HOME_SAMPLE.missed_item}</p>
          </div>
          <div className="msg">
            <div className="msg-meta">
              <span className="who who-p">
                <i />
                Chị Thu
              </span>
              <span className="time">{HOME_SAMPLE.persona_turn}</span>
            </div>
            <div className="bubble-p">
              {before}
              <mark>{HOME_SAMPLE.quote_marked}</mark>
              {after}
            </div>
          </div>
          <div className="msg">
            <div className="msg-meta">
              <span className="who who-me">
                <i />
                {HOME_SAMPLE.learner_who}
              </span>
              <span className="time">{HOME_SAMPLE.learner_turn}</span>
            </div>
            <div className="bubble-me">{HOME_SAMPLE.learner_question}</div>
          </div>
          <div className="signal">
            <SparkIcon size={20} className="c-secondary" />
            <p className="body-sm">{HOME_SAMPLE.diagnosis}</p>
          </div>
        </div>
      </div>
    </figure>
  );
}
